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

describe('schedule.service — BE-14 월/주/일 일정 조회 (BR-03, BR-16)', () => {
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

  async function setupTeam({ memberCount = 2 } = {}) {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const leaderId = await createUser('팀장', `leader-${suffix}@test.com`);
    createdUserIds.push(leaderId);
    const teamId = await createTeamWithLeader(`조회테스트팀-${suffix}`, leaderId);
    createdTeamIds.push(teamId);

    const memberIds = [];
    for (let i = 0; i < memberCount; i += 1) {
      const memberId = await createUser(`팀원${i}`, `viewmember${i}-${suffix}@test.com`);
      createdUserIds.push(memberId);
      await addMembership(teamId, memberId, 'member');
      memberIds.push(memberId);
    }

    return { leaderId, teamId, memberIds };
  }

  test('월경계에 걸친 일정이 두 인접 월 조회 모두에 포함된다', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
    const title = `월경계일정-${Date.now()}`;

    await scheduleService.createSchedule('leader', teamId, leaderId, {
      title,
      startAt: '2026-07-31T15:00:00.000Z',
      endAt: '2026-08-01T01:00:00.000Z',
    });

    const julyResult = await scheduleService.getSchedules('leader', teamId, 'month', '2026-07-10');
    const augResult = await scheduleService.getSchedules('leader', teamId, 'month', '2026-08-05');

    expect(julyResult.some((s) => s.title === title)).toBe(true);
    expect(augResult.some((s) => s.title === title)).toBe(true);
  });

  test('주경계(월요일 시작)에 걸친 일정이 인접한 두 주 조회 모두에 포함되고 수요일 조회도 같은 주를 반환한다', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
    const title = `주경계일정-${Date.now()}`;

    await scheduleService.createSchedule('leader', teamId, leaderId, {
      title,
      startAt: '2026-07-19T23:30:00.000Z',
      endAt: '2026-07-20T00:30:00.000Z',
    });

    const thisWeek = await scheduleService.getSchedules('leader', teamId, 'week', '2026-07-13');
    const nextWeek = await scheduleService.getSchedules('leader', teamId, 'week', '2026-07-20');
    const midWeek = await scheduleService.getSchedules('leader', teamId, 'week', '2026-07-15');

    expect(thisWeek.some((s) => s.title === title)).toBe(true);
    expect(nextWeek.some((s) => s.title === title)).toBe(true);
    expect(midWeek.some((s) => s.title === title)).toBe(true);
  });

  test('일경계에 걸친 일정이 인접한 두 날짜 조회 모두에 포함된다', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
    const title = `일경계일정-${Date.now()}`;

    await scheduleService.createSchedule('leader', teamId, leaderId, {
      title,
      startAt: '2026-07-14T23:00:00.000Z',
      endAt: '2026-07-15T01:00:00.000Z',
    });

    const day14 = await scheduleService.getSchedules('leader', teamId, 'day', '2026-07-14');
    const day15 = await scheduleService.getSchedules('leader', teamId, 'day', '2026-07-15');

    expect(day14.some((s) => s.title === title)).toBe(true);
    expect(day15.some((s) => s.title === title)).toBe(true);
  });

  test('canEdit은 leader 조회 시 전부 true, member 조회 시 전부 false이며 participants 필드는 없다', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });

    await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: 'canEdit 검증 일정 1',
      startAt: '2026-09-01T09:00:00.000Z',
      endAt: '2026-09-01T10:00:00.000Z',
    });
    await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: 'canEdit 검증 일정 2',
      startAt: '2026-09-02T09:00:00.000Z',
      endAt: '2026-09-02T10:00:00.000Z',
    });

    const leaderView = await scheduleService.getSchedules('leader', teamId, 'month', '2026-09-15');
    const memberView = await scheduleService.getSchedules('member', teamId, 'month', '2026-09-15');

    expect(leaderView.length).toBeGreaterThanOrEqual(2);
    expect(leaderView.every((s) => s.canEdit === true)).toBe(true);
    expect(memberView.length).toBeGreaterThanOrEqual(2);
    expect(memberView.every((s) => s.canEdit === false)).toBe(true);

    leaderView.forEach((item) => {
      expect(item).not.toHaveProperty('participants');
    });
  });

  test('범위 밖(다른 달) 일정은 결과에 포함되지 않는다', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
    const outOfRangeTitle = `범위밖일정-${Date.now()}`;

    await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: outOfRangeTitle,
      startAt: '2026-10-15T09:00:00.000Z',
      endAt: '2026-10-15T10:00:00.000Z',
    });

    const julyResult = await scheduleService.getSchedules('leader', teamId, 'month', '2026-07-10');
    expect(julyResult.some((s) => s.title === outOfRangeTitle)).toBe(false);
  });

  test('다른 팀의 일정이 섞여 나오지 않는다', async () => {
    const teamA = await setupTeam({ memberCount: 0 });
    const teamB = await setupTeam({ memberCount: 0 });
    const sameDate = '2026-11-10T09:00:00.000Z';
    const sameDateEnd = '2026-11-10T10:00:00.000Z';
    const titleA = `팀A일정-${Date.now()}`;
    const titleB = `팀B일정-${Date.now()}`;

    await scheduleService.createSchedule('leader', teamA.teamId, teamA.leaderId, {
      title: titleA,
      startAt: sameDate,
      endAt: sameDateEnd,
    });
    await scheduleService.createSchedule('leader', teamB.teamId, teamB.leaderId, {
      title: titleB,
      startAt: sameDate,
      endAt: sameDateEnd,
    });

    const teamAResult = await scheduleService.getSchedules('leader', teamA.teamId, 'month', '2026-11-05');
    const teamBResult = await scheduleService.getSchedules('leader', teamB.teamId, 'month', '2026-11-05');

    expect(teamAResult.every((s) => s.teamId === teamA.teamId)).toBe(true);
    expect(teamAResult.some((s) => s.title === titleB)).toBe(false);
    expect(teamBResult.every((s) => s.teamId === teamB.teamId)).toBe(true);
    expect(teamBResult.some((s) => s.title === titleA)).toBe(false);
  });

  test('view가 유효하지 않으면 400을 반환한다', async () => {
    const { teamId } = await setupTeam({ memberCount: 0 });

    await expect(
      scheduleService.getSchedules('leader', teamId, 'invalid', '2026-07-10'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('존재하지 않는 날짜(2026-13-40)이면 400을 반환한다', async () => {
    const { teamId } = await setupTeam({ memberCount: 0 });

    await expect(
      scheduleService.getSchedules('leader', teamId, 'month', '2026-13-40'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('날짜 형식이 잘못되면(2026/07/10) 400을 반환한다', async () => {
    const { teamId } = await setupTeam({ memberCount: 0 });

    await expect(
      scheduleService.getSchedules('leader', teamId, 'month', '2026/07/10'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('date가 생략되면 400을 반환한다', async () => {
    const { teamId } = await setupTeam({ memberCount: 0 });

    await expect(
      scheduleService.getSchedules('leader', teamId, 'month', undefined),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
