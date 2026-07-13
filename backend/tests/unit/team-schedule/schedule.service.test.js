require('dotenv').config();

const { pool } = require('../../../src/db/pool');
const scheduleService = require('../../../src/modules/team-schedule/schedule.service');

async function createUser(name, email) {
  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, 'x')
     RETURNING id`,
    [name, email],
  );
  return result.rows[0].id;
}

async function createTeamWithLeader(name, leaderId) {
  const teamResult = await pool.query(
    'INSERT INTO teams (name, created_by) VALUES ($1, $2) RETURNING id',
    [name, leaderId],
  );
  const teamId = teamResult.rows[0].id;
  await pool.query(
    `INSERT INTO team_memberships (team_id, user_id, role) VALUES ($1, $2, 'leader')`,
    [teamId, leaderId],
  );
  return teamId;
}

async function addMembership(teamId, userId, role) {
  await pool.query('INSERT INTO team_memberships (team_id, user_id, role) VALUES ($1, $2, $3)', [
    teamId,
    userId,
    role,
  ]);
}

async function cleanupTeam(teamId) {
  // schedules/schedule_participants는 teams FK ON DELETE CASCADE로 함께 삭제된다.
  await pool.query('DELETE FROM team_memberships WHERE team_id = $1', [teamId]);
  await pool.query('DELETE FROM teams WHERE id = $1', [teamId]);
}

async function countSchedulesByTeam(teamId) {
  const result = await pool.query('SELECT COUNT(*)::int AS count FROM schedules WHERE team_id = $1', [
    teamId,
  ]);
  return result.rows[0].count;
}

describe('schedule.service — BE-12 / BR-02 / BR-07 팀 일정 생성', () => {
  const createdUserIds = [];
  const createdTeamIds = [];

  afterAll(async () => {
    for (const teamId of createdTeamIds) {
      await cleanupTeam(teamId);
    }
    for (const id of createdUserIds) {
      await pool.query('DELETE FROM users WHERE id = $1', [id]);
    }
    // 이 파일에는 하단에 BE-13 describe 블록이 이어지며 동일한 pool 싱글턴을 공유하므로,
    // pool.end()는 파일 내 마지막 describe 블록의 afterAll에서만 호출한다.
  });

  async function setupTeam({ memberCount = 2 } = {}) {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const leaderId = await createUser('팀장', `leader-${suffix}@test.com`);
    createdUserIds.push(leaderId);
    const teamId = await createTeamWithLeader(`일정테스트팀-${suffix}`, leaderId);
    createdTeamIds.push(teamId);

    const memberIds = [];
    for (let i = 0; i < memberCount; i += 1) {
      const memberId = await createUser(`팀원${i}`, `member${i}-${suffix}@test.com`);
      createdUserIds.push(memberId);
      await addMembership(teamId, memberId, 'member');
      memberIds.push(memberId);
    }

    return { leaderId, teamId, memberIds };
  }

  test('팀장이 팀 소속 참여자와 함께 일정을 생성하면 성공한다 (SC-03 기본 흐름)', async () => {
    const { leaderId, teamId, memberIds } = await setupTeam({ memberCount: 2 });

    const result = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '주간 회의',
      description: '스프린트 회고',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: memberIds,
    });

    expect(result.teamId).toBe(teamId);
    expect(result.title).toBe('주간 회의');
    expect(result.createdBy).toBe(leaderId);
    expect(result.id).toBeDefined();

    const participantUserIds = result.participants.map((p) => p.userId).sort();
    expect(participantUserIds).toEqual([...memberIds].sort());
    result.participants.forEach((p) => {
      expect(p).toHaveProperty('name');
      expect(p).toHaveProperty('email');
    });

    const scheduleRow = await pool.query(
      'SELECT id, team_id AS "teamId", title, created_by AS "createdBy" FROM schedules WHERE id = $1',
      [result.id],
    );
    expect(scheduleRow.rowCount).toBe(1);
    expect(scheduleRow.rows[0].teamId).toBe(teamId);
    expect(scheduleRow.rows[0].createdBy).toBe(leaderId);

    const participantRows = await pool.query(
      'SELECT user_id AS "userId" FROM schedule_participants WHERE schedule_id = $1',
      [result.id],
    );
    expect(participantRows.rows.map((r) => r.userId).sort()).toEqual([...memberIds].sort());
  });

  test('팀원이 호출하면 403이며 일정이 생성되지 않는다 (SC-03 E1)', async () => {
    const { teamId, memberIds } = await setupTeam({ memberCount: 1 });
    const beforeCount = await countSchedulesByTeam(teamId);

    await expect(
      scheduleService.createSchedule('member', teamId, memberIds[0], {
        title: '팀원이 만든 일정',
        startAt: '2026-07-14T09:00:00.000Z',
        endAt: '2026-07-14T10:00:00.000Z',
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    const afterCount = await countSchedulesByTeam(teamId);
    expect(afterCount).toBe(beforeCount);
  });

  test('body.teamId가 무엇이든 저장되는 team_id는 함수 인자 teamId로 고정된다 (BR-07)', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
    const bogusTeamId = 999999999;

    const result = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: 'BR-07 검증용 일정',
      startAt: '2026-07-15T09:00:00.000Z',
      endAt: '2026-07-15T10:00:00.000Z',
      teamId: bogusTeamId,
      participantUserIds: [],
    });

    expect(result.teamId).toBe(teamId);
    expect(result.teamId).not.toBe(bogusTeamId);

    const scheduleRow = await pool.query('SELECT team_id AS "teamId" FROM schedules WHERE id = $1', [
      result.id,
    ]);
    expect(scheduleRow.rows[0].teamId).toBe(teamId);
  });

  test('팀에 속하지 않은 참여자가 포함되면 400이며 일정이 생성되지 않는다', async () => {
    const { leaderId, teamId, memberIds } = await setupTeam({ memberCount: 1 });
    const outsider = await createUser('외부인', `outsider-${Date.now()}@test.com`);
    createdUserIds.push(outsider);
    const beforeCount = await countSchedulesByTeam(teamId);

    await expect(
      scheduleService.createSchedule('leader', teamId, leaderId, {
        title: '외부인 포함 일정',
        startAt: '2026-07-14T09:00:00.000Z',
        endAt: '2026-07-14T10:00:00.000Z',
        participantUserIds: [...memberIds, outsider],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    const afterCount = await countSchedulesByTeam(teamId);
    expect(afterCount).toBe(beforeCount);
  });

  test('participantUserIds를 생략하면 참여자 없이 성공한다', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });

    const result = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '참여자 없는 일정',
      startAt: '2026-07-16T09:00:00.000Z',
      endAt: '2026-07-16T10:00:00.000Z',
    });

    expect(result.participants).toEqual([]);
  });

  test('participantUserIds가 빈 배열이면 참여자 없이 성공한다', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });

    const result = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '참여자 빈 배열 일정',
      startAt: '2026-07-16T09:00:00.000Z',
      endAt: '2026-07-16T10:00:00.000Z',
      participantUserIds: [],
    });

    expect(result.participants).toEqual([]);
  });

  test('participantUserIds에 같은 user_id가 중복되면 dedupe되어 1건만 저장된다', async () => {
    const { leaderId, teamId, memberIds } = await setupTeam({ memberCount: 1 });
    const memberId = memberIds[0];

    const result = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '중복 참여자 일정',
      startAt: '2026-07-17T09:00:00.000Z',
      endAt: '2026-07-17T10:00:00.000Z',
      participantUserIds: [memberId, memberId],
    });

    expect(result.participants.map((p) => p.userId)).toEqual([memberId]);

    const participantRows = await pool.query(
      'SELECT user_id AS "userId" FROM schedule_participants WHERE schedule_id = $1',
      [result.id],
    );
    expect(participantRows.rowCount).toBe(1);
    expect(participantRows.rows[0].userId).toBe(memberId);
  });
});

describe('schedule.service — BE-13 일정 수정/삭제 (BR-02, BR-03)', () => {
  const createdUserIds = [];
  const createdTeamIds = [];

  afterAll(async () => {
    for (const teamId of createdTeamIds) {
      await cleanupTeam(teamId);
    }
    for (const id of createdUserIds) {
      await pool.query('DELETE FROM users WHERE id = $1', [id]);
    }
    await pool.end();
  });

  async function setupTeam({ memberCount = 2 } = {}) {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const leaderId = await createUser('팀장', `be13-leader-${suffix}@test.com`);
    createdUserIds.push(leaderId);
    const teamId = await createTeamWithLeader(`BE13일정테스트팀-${suffix}`, leaderId);
    createdTeamIds.push(teamId);

    const memberIds = [];
    for (let i = 0; i < memberCount; i += 1) {
      const memberId = await createUser(`BE13팀원${i}`, `be13-member${i}-${suffix}@test.com`);
      createdUserIds.push(memberId);
      await addMembership(teamId, memberId, 'member');
      memberIds.push(memberId);
    }

    return { leaderId, teamId, memberIds };
  }

  async function getParticipantUserIds(scheduleId) {
    const result = await pool.query(
      'SELECT user_id AS "userId" FROM schedule_participants WHERE schedule_id = $1',
      [scheduleId],
    );
    return result.rows.map((r) => r.userId);
  }

  async function scheduleExists(scheduleId) {
    const result = await pool.query('SELECT COUNT(*)::int AS count FROM schedules WHERE id = $1', [
      scheduleId,
    ]);
    return result.rows[0].count > 0;
  }

  async function getScheduleRow(scheduleId) {
    const result = await pool.query(
      `SELECT id, team_id AS "teamId", title, description,
              start_at AS "startAt", end_at AS "endAt", created_by AS "createdBy"
         FROM schedules WHERE id = $1`,
      [scheduleId],
    );
    return result.rows[0];
  }

  describe('updateScheduleFields', () => {
    test('팀장이 title/description/startAt/endAt을 수정하면 200 상당 반환값과 DB 반영이 일치한다', async () => {
      const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
      const created = await scheduleService.createSchedule('leader', teamId, leaderId, {
        title: '원래 제목',
        description: '원래 설명',
        startAt: '2026-07-14T09:00:00.000Z',
        endAt: '2026-07-14T10:00:00.000Z',
      });

      const result = await scheduleService.updateScheduleFields('leader', teamId, created.id, {
        title: '수정된 제목',
        description: '수정된 설명',
        startAt: '2026-07-14T11:00:00.000Z',
        endAt: '2026-07-14T12:00:00.000Z',
      });

      expect(result.id).toBe(created.id);
      expect(result.title).toBe('수정된 제목');
      expect(result.description).toBe('수정된 설명');
      expect(new Date(result.startAt).toISOString()).toBe('2026-07-14T11:00:00.000Z');
      expect(new Date(result.endAt).toISOString()).toBe('2026-07-14T12:00:00.000Z');

      const row = await getScheduleRow(created.id);
      expect(row.title).toBe('수정된 제목');
      expect(row.description).toBe('수정된 설명');
    });

    test('participantUserIds를 새 목록으로 교체하면 기존 참여자는 제거되고 신규 참여자만 남는다', async () => {
      const { leaderId, teamId, memberIds } = await setupTeam({ memberCount: 3 });
      const created = await scheduleService.createSchedule('leader', teamId, leaderId, {
        title: '참여자 교체 테스트',
        startAt: '2026-07-14T09:00:00.000Z',
        endAt: '2026-07-14T10:00:00.000Z',
        participantUserIds: [memberIds[0], memberIds[1]],
      });
      expect((await getParticipantUserIds(created.id)).sort()).toEqual(
        [memberIds[0], memberIds[1]].sort(),
      );

      const result = await scheduleService.updateScheduleFields('leader', teamId, created.id, {
        participantUserIds: [memberIds[2]],
      });

      expect(result.participants.map((p) => p.userId)).toEqual([memberIds[2]]);
      expect(await getParticipantUserIds(created.id)).toEqual([memberIds[2]]);
    });

    test('participantUserIds를 patch에 미포함하면 기존 참여자가 그대로 유지된다', async () => {
      const { leaderId, teamId, memberIds } = await setupTeam({ memberCount: 2 });
      const created = await scheduleService.createSchedule('leader', teamId, leaderId, {
        title: '참여자 유지 테스트',
        startAt: '2026-07-14T09:00:00.000Z',
        endAt: '2026-07-14T10:00:00.000Z',
        participantUserIds: memberIds,
      });

      const result = await scheduleService.updateScheduleFields('leader', teamId, created.id, {
        title: '제목만 변경',
      });

      expect(result.title).toBe('제목만 변경');
      expect(result.participants.map((p) => p.userId).sort()).toEqual([...memberIds].sort());
      expect((await getParticipantUserIds(created.id)).sort()).toEqual([...memberIds].sort());
    });

    test('빈 patch({})면 DB 값 변경 없이 현재 상태 그대로 성공한다', async () => {
      const { leaderId, teamId, memberIds } = await setupTeam({ memberCount: 1 });
      const created = await scheduleService.createSchedule('leader', teamId, leaderId, {
        title: '변경 없음 테스트',
        description: '설명 유지',
        startAt: '2026-07-14T09:00:00.000Z',
        endAt: '2026-07-14T10:00:00.000Z',
        participantUserIds: memberIds,
      });

      const result = await scheduleService.updateScheduleFields('leader', teamId, created.id, {});

      expect(result.title).toBe('변경 없음 테스트');
      expect(result.description).toBe('설명 유지');
      expect(result.participants.map((p) => p.userId)).toEqual(memberIds);

      const row = await getScheduleRow(created.id);
      expect(row.title).toBe('변경 없음 테스트');
      expect(row.description).toBe('설명 유지');
    });

    test('팀원이 호출하면 403이며 DB가 변경되지 않는다', async () => {
      const { leaderId, teamId, memberIds } = await setupTeam({ memberCount: 1 });
      const created = await scheduleService.createSchedule('leader', teamId, leaderId, {
        title: '원본 제목',
        startAt: '2026-07-14T09:00:00.000Z',
        endAt: '2026-07-14T10:00:00.000Z',
      });

      await expect(
        scheduleService.updateScheduleFields('member', teamId, created.id, {
          title: '팀원이 시도한 수정',
        }),
      ).rejects.toMatchObject({ statusCode: 403 });

      const row = await getScheduleRow(created.id);
      expect(row.title).toBe('원본 제목');
    });

    test('존재하지 않는 scheduleId면 404를 반환한다', async () => {
      const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
      const nonExistentId = 999999999;

      await expect(
        scheduleService.updateScheduleFields('leader', teamId, nonExistentId, {
          title: '존재하지 않는 일정',
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    test('다른 팀 소속 scheduleId를 호출자의 다른 teamId로 수정 시도하면 404를 반환한다 (BR-16)', async () => {
      const teamA = await setupTeam({ memberCount: 0 });
      const teamB = await setupTeam({ memberCount: 0 });

      const created = await scheduleService.createSchedule('leader', teamA.teamId, teamA.leaderId, {
        title: 'A팀 일정',
        startAt: '2026-07-14T09:00:00.000Z',
        endAt: '2026-07-14T10:00:00.000Z',
      });

      await expect(
        scheduleService.updateScheduleFields('leader', teamB.teamId, created.id, {
          title: 'B팀 팀장의 시도',
        }),
      ).rejects.toMatchObject({ statusCode: 404 });

      const row = await getScheduleRow(created.id);
      expect(row.title).toBe('A팀 일정');
    });

    test('endAt만 startAt보다 이전으로 부분 수정하면 400이며 미반영된다', async () => {
      const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
      const created = await scheduleService.createSchedule('leader', teamId, leaderId, {
        title: '시간 검증 테스트',
        startAt: '2026-07-14T09:00:00.000Z',
        endAt: '2026-07-14T10:00:00.000Z',
      });

      await expect(
        scheduleService.updateScheduleFields('leader', teamId, created.id, {
          endAt: '2026-07-14T08:00:00.000Z',
        }),
      ).rejects.toMatchObject({ statusCode: 400 });

      const row = await getScheduleRow(created.id);
      expect(new Date(row.endAt).toISOString()).toBe('2026-07-14T10:00:00.000Z');
    });

    test('startAt만 기존 endAt보다 이후로 부분 수정(역전)하면 400이며 미반영된다', async () => {
      const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
      const created = await scheduleService.createSchedule('leader', teamId, leaderId, {
        title: '시간 역전 테스트',
        startAt: '2026-07-14T09:00:00.000Z',
        endAt: '2026-07-14T10:00:00.000Z',
      });

      await expect(
        scheduleService.updateScheduleFields('leader', teamId, created.id, {
          startAt: '2026-07-14T11:00:00.000Z',
        }),
      ).rejects.toMatchObject({ statusCode: 400 });

      const row = await getScheduleRow(created.id);
      expect(new Date(row.startAt).toISOString()).toBe('2026-07-14T09:00:00.000Z');
    });

    test('팀 비소속 사용자를 participantUserIds에 포함하면 400이며 미반영된다', async () => {
      const { leaderId, teamId, memberIds } = await setupTeam({ memberCount: 1 });
      const outsider = await createUser('BE13외부인', `be13-outsider-${Date.now()}@test.com`);
      createdUserIds.push(outsider);

      const created = await scheduleService.createSchedule('leader', teamId, leaderId, {
        title: '외부인 수정 테스트',
        startAt: '2026-07-14T09:00:00.000Z',
        endAt: '2026-07-14T10:00:00.000Z',
        participantUserIds: memberIds,
      });

      await expect(
        scheduleService.updateScheduleFields('leader', teamId, created.id, {
          participantUserIds: [...memberIds, outsider],
        }),
      ).rejects.toMatchObject({ statusCode: 400 });

      expect((await getParticipantUserIds(created.id)).sort()).toEqual([...memberIds].sort());
    });

    test('participantUserIds에 중복 값이 있으면 dedupe되어 1건만 저장된다', async () => {
      const { leaderId, teamId, memberIds } = await setupTeam({ memberCount: 1 });
      const memberId = memberIds[0];
      const created = await scheduleService.createSchedule('leader', teamId, leaderId, {
        title: '수정 중복 참여자 테스트',
        startAt: '2026-07-14T09:00:00.000Z',
        endAt: '2026-07-14T10:00:00.000Z',
      });

      const result = await scheduleService.updateScheduleFields('leader', teamId, created.id, {
        participantUserIds: [memberId, memberId],
      });

      expect(result.participants.map((p) => p.userId)).toEqual([memberId]);
      expect(await getParticipantUserIds(created.id)).toEqual([memberId]);
    });

    test('description을 명시적으로 null로 patch하면 null로 반영된다', async () => {
      const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
      const created = await scheduleService.createSchedule('leader', teamId, leaderId, {
        title: 'description null 테스트',
        description: '삭제될 설명',
        startAt: '2026-07-14T09:00:00.000Z',
        endAt: '2026-07-14T10:00:00.000Z',
      });

      const result = await scheduleService.updateScheduleFields('leader', teamId, created.id, {
        description: null,
      });

      expect(result.description).toBeNull();
      const row = await getScheduleRow(created.id);
      expect(row.description).toBeNull();
    });
  });

  describe('deleteSchedule', () => {
    test('팀장이 삭제하면 성공하며 schedules/schedule_participants 행이 모두 삭제된다', async () => {
      const { leaderId, teamId, memberIds } = await setupTeam({ memberCount: 2 });
      const created = await scheduleService.createSchedule('leader', teamId, leaderId, {
        title: '삭제될 일정',
        startAt: '2026-07-14T09:00:00.000Z',
        endAt: '2026-07-14T10:00:00.000Z',
        participantUserIds: memberIds,
      });

      await expect(
        scheduleService.deleteSchedule('leader', teamId, created.id),
      ).resolves.toBeUndefined();

      expect(await scheduleExists(created.id)).toBe(false);
      expect(await getParticipantUserIds(created.id)).toEqual([]);
    });

    test('팀원이 삭제를 시도하면 403이며 삭제되지 않는다', async () => {
      const { leaderId, teamId, memberIds } = await setupTeam({ memberCount: 1 });
      const created = await scheduleService.createSchedule('leader', teamId, leaderId, {
        title: '팀원이 삭제 시도할 일정',
        startAt: '2026-07-14T09:00:00.000Z',
        endAt: '2026-07-14T10:00:00.000Z',
      });

      await expect(
        scheduleService.deleteSchedule('member', teamId, created.id),
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(await scheduleExists(created.id)).toBe(true);
    });

    test('존재하지 않거나 다른 팀 scheduleId를 삭제 시도하면 404를 반환한다', async () => {
      const teamA = await setupTeam({ memberCount: 0 });
      const teamB = await setupTeam({ memberCount: 0 });
      const nonExistentId = 999999999;

      await expect(
        scheduleService.deleteSchedule('leader', teamA.teamId, nonExistentId),
      ).rejects.toMatchObject({ statusCode: 404 });

      const created = await scheduleService.createSchedule('leader', teamA.teamId, teamA.leaderId, {
        title: 'A팀 일정 (교차 삭제 방지 확인)',
        startAt: '2026-07-14T09:00:00.000Z',
        endAt: '2026-07-14T10:00:00.000Z',
      });

      await expect(
        scheduleService.deleteSchedule('leader', teamB.teamId, created.id),
      ).rejects.toMatchObject({ statusCode: 404 });

      expect(await scheduleExists(created.id)).toBe(true);
    });
  });
});
