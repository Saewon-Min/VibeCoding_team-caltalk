require('dotenv').config();

const { pool } = require('../../../src/db/pool');
const scheduleService = require('../../../src/modules/team-schedule/schedule.service');
const changeRequestService = require('../../../src/modules/change-request/change-request.service');

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
  // schedules/schedule_participants/messages/schedule_change_requests는 teams FK ON DELETE
  // CASCADE로 함께 삭제된다.
  await pool.query('DELETE FROM team_memberships WHERE team_id = $1', [teamId]);
  await pool.query('DELETE FROM teams WHERE id = $1', [teamId]);
}

async function countChangeRequestsByRequester(requesterId) {
  const result = await pool.query(
    'SELECT COUNT(*)::int AS count FROM schedule_change_requests WHERE requester_id = $1',
    [requesterId],
  );
  return result.rows[0].count;
}

async function countMessagesByTeam(teamId) {
  const result = await pool.query('SELECT COUNT(*)::int AS count FROM messages WHERE team_id = $1', [
    teamId,
  ]);
  return result.rows[0].count;
}

async function getChangeRequestRow(id) {
  const result = await pool.query(
    `SELECT id, schedule_id AS "scheduleId", message_id AS "messageId",
            requester_id AS "requesterId", proposed_title AS "proposedTitle",
            proposed_start_at AS "proposedStartAt", proposed_end_at AS "proposedEndAt",
            reason, status, processed_by AS "processedBy", processed_at AS "processedAt",
            created_at AS "createdAt"
       FROM schedule_change_requests WHERE id = $1`,
    [id],
  );
  return result.rows[0];
}

async function getMessageRow(id) {
  const result = await pool.query(
    `SELECT id, team_id AS "teamId", author_id AS "authorId",
            message_type AS "messageType", content
       FROM messages WHERE id = $1`,
    [id],
  );
  return result.rows[0];
}

describe('change-request.service — BE-18 변경 요청 제기 (BR-10)', () => {
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
    const leaderId = await createUser('팀장', `cr-leader-${suffix}@test.com`);
    createdUserIds.push(leaderId);
    const teamId = await createTeamWithLeader(`변경요청테스트팀-${suffix}`, leaderId);
    createdTeamIds.push(teamId);

    const memberIds = [];
    for (let i = 0; i < memberCount; i += 1) {
      const memberId = await createUser(`팀원${i}`, `cr-member${i}-${suffix}@test.com`);
      createdUserIds.push(memberId);
      await addMembership(teamId, memberId, 'member');
      memberIds.push(memberId);
    }

    return { leaderId, teamId, memberIds };
  }

  test('참여자인 팀원이 요청하면 반환값과 DB(schedule_change_requests/messages)가 모두 생성된다', async () => {
    const { leaderId, teamId, memberIds } = await setupTeam({ memberCount: 1 });
    const memberId = memberIds[0];
    const schedule = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '주간 회의',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [memberId],
    });

    const result = await changeRequestService.createChangeRequest(teamId, schedule.id, memberId, {
      reason: '시간을 변경하고 싶습니다',
    });

    expect(result).toMatchObject({
      scheduleId: schedule.id,
      requesterId: memberId,
      proposedTitle: null,
      proposedStartAt: null,
      proposedEndAt: null,
      reason: '시간을 변경하고 싶습니다',
      status: 'pending',
      processedBy: null,
      processedAt: null,
    });
    expect(result.id).toBeDefined();
    expect(result.messageId).toBeDefined();

    const crRow = await getChangeRequestRow(result.id);
    expect(crRow).toBeDefined();
    expect(crRow.status).toBe('pending');
    expect(crRow.scheduleId).toBe(schedule.id);
    expect(crRow.requesterId).toBe(memberId);
    expect(crRow.messageId).toBe(result.messageId);

    const msgRow = await getMessageRow(result.messageId);
    expect(msgRow).toBeDefined();
    expect(msgRow.messageType).toBe('change_request');
    expect(msgRow.authorId).toBe(memberId);
    expect(msgRow.content).toBe('시간을 변경하고 싶습니다');
  });

  test('반환된 messageId가 실제 생성된 messages.id와 일치한다', async () => {
    const { leaderId, teamId, memberIds } = await setupTeam({ memberCount: 1 });
    const memberId = memberIds[0];
    const schedule = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [memberId],
    });

    const result = await changeRequestService.createChangeRequest(teamId, schedule.id, memberId, {
      reason: '일정 확인 요청',
    });

    const msgRow = await getMessageRow(result.messageId);
    expect(msgRow.id).toBe(result.messageId);
  });

  test('반환된 message content가 reason과 정확히 일치한다', async () => {
    const { leaderId, teamId, memberIds } = await setupTeam({ memberCount: 1 });
    const memberId = memberIds[0];
    const schedule = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [memberId],
    });
    const reason = '정확히 이 문구와 일치해야 합니다 - 12345';

    const result = await changeRequestService.createChangeRequest(teamId, schedule.id, memberId, {
      reason,
    });

    const msgRow = await getMessageRow(result.messageId);
    expect(msgRow.content).toBe(reason);
  });

  test('비참여자(팀 소속이지만 해당 일정 참여자 아님)가 요청하면 403이며 아무것도 생성되지 않는다', async () => {
    const { leaderId, teamId, memberIds } = await setupTeam({ memberCount: 2 });
    const [participant, outsider] = memberIds;
    const schedule = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [participant],
    });

    const beforeCrCount = await countChangeRequestsByRequester(outsider);
    const beforeMsgCount = await countMessagesByTeam(teamId);

    await expect(
      changeRequestService.createChangeRequest(teamId, schedule.id, outsider, {
        reason: '비참여자의 요청',
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(await countChangeRequestsByRequester(outsider)).toBe(beforeCrCount);
    expect(await countMessagesByTeam(teamId)).toBe(beforeMsgCount);
  });

  test('팀장 본인이 참여자로 지정된 일정에 대해 요청해도 성공한다 (BR-10 역할 무관)', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
    const schedule = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '리더 참여 일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [leaderId],
    });

    const result = await changeRequestService.createChangeRequest(teamId, schedule.id, leaderId, {
      reason: '팀장도 요청 가능',
    });

    expect(result.requesterId).toBe(leaderId);
    expect(result.status).toBe('pending');

    const crRow = await getChangeRequestRow(result.id);
    expect(crRow).toBeDefined();
  });

  test('존재하지 않는 scheduleId면 404이며 아무것도 생성되지 않는다', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
    const nonExistentId = 999999999;
    const beforeMsgCount = await countMessagesByTeam(teamId);

    await expect(
      changeRequestService.createChangeRequest(teamId, nonExistentId, leaderId, {
        reason: '존재하지 않는 일정',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(await countMessagesByTeam(teamId)).toBe(beforeMsgCount);
    expect(await countChangeRequestsByRequester(leaderId)).toBe(0);
  });

  test('다른 팀 소속 scheduleId를 요청하면 404이며 아무것도 생성되지 않는다', async () => {
    const teamA = await setupTeam({ memberCount: 0 });
    const teamB = await setupTeam({ memberCount: 0 });

    const scheduleA = await scheduleService.createSchedule('leader', teamA.teamId, teamA.leaderId, {
      title: 'A팀 일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [teamA.leaderId],
    });

    const beforeMsgCount = await countMessagesByTeam(teamB.teamId);

    await expect(
      changeRequestService.createChangeRequest(teamB.teamId, scheduleA.id, teamB.leaderId, {
        reason: '다른 팀에서의 시도',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(await countMessagesByTeam(teamB.teamId)).toBe(beforeMsgCount);
    expect(await countChangeRequestsByRequester(teamB.leaderId)).toBe(0);
  });

  test('body.reason이 누락되면 400이며 아무것도 생성되지 않는다', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
    const schedule = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [leaderId],
    });
    const beforeMsgCount = await countMessagesByTeam(teamId);

    await expect(
      changeRequestService.createChangeRequest(teamId, schedule.id, leaderId, {}),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(await countMessagesByTeam(teamId)).toBe(beforeMsgCount);
    expect(await countChangeRequestsByRequester(leaderId)).toBe(0);
  });

  test('reason이 공백 문자열이면 400이며 아무것도 생성되지 않는다', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
    const schedule = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [leaderId],
    });
    const beforeMsgCount = await countMessagesByTeam(teamId);

    await expect(
      changeRequestService.createChangeRequest(teamId, schedule.id, leaderId, { reason: '   ' }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(await countMessagesByTeam(teamId)).toBe(beforeMsgCount);
    expect(await countChangeRequestsByRequester(leaderId)).toBe(0);
  });

  test('proposedTitle/proposedStartAt/proposedEndAt을 생략하면 반환값과 DB 행 모두 null이다', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
    const schedule = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [leaderId],
    });

    const result = await changeRequestService.createChangeRequest(teamId, schedule.id, leaderId, {
      reason: '필드 생략 테스트',
    });

    expect(result.proposedTitle).toBeNull();
    expect(result.proposedStartAt).toBeNull();
    expect(result.proposedEndAt).toBeNull();

    const crRow = await getChangeRequestRow(result.id);
    expect(crRow.proposedTitle).toBeNull();
    expect(crRow.proposedStartAt).toBeNull();
    expect(crRow.proposedEndAt).toBeNull();
  });

  test('세 필드를 모두 전달하면 반환값과 DB 행에 정확히 반영된다', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
    const schedule = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [leaderId],
    });

    const proposedTitle = '변경된 제목';
    const proposedStartAt = '2026-07-15T09:00:00.000Z';
    const proposedEndAt = '2026-07-15T10:00:00.000Z';

    const result = await changeRequestService.createChangeRequest(teamId, schedule.id, leaderId, {
      reason: '전체 필드 테스트',
      proposedTitle,
      proposedStartAt,
      proposedEndAt,
    });

    expect(result.proposedTitle).toBe(proposedTitle);
    expect(new Date(result.proposedStartAt).toISOString()).toBe(proposedStartAt);
    expect(new Date(result.proposedEndAt).toISOString()).toBe(proposedEndAt);

    const crRow = await getChangeRequestRow(result.id);
    expect(crRow.proposedTitle).toBe(proposedTitle);
    expect(new Date(crRow.proposedStartAt).toISOString()).toBe(proposedStartAt);
    expect(new Date(crRow.proposedEndAt).toISOString()).toBe(proposedEndAt);
  });

  test('반환값에 processedBy: null, processedAt: null 키가 항상 존재한다', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
    const schedule = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [leaderId],
    });

    const result = await changeRequestService.createChangeRequest(teamId, schedule.id, leaderId, {
      reason: 'processedBy/processedAt 검증',
    });

    expect(result).toHaveProperty('processedBy');
    expect(result.processedBy).toBeNull();
    expect(result).toHaveProperty('processedAt');
    expect(result.processedAt).toBeNull();
  });

  test('요청자가 다중 팀(teamB) 소속이고 scheduleId가 teamB 소속이어도 URL teamId(teamA)로는 404가 난다', async () => {
    const teamA = await setupTeam({ memberCount: 0 });
    const teamB = await setupTeam({ memberCount: 0 });

    // teamA의 리더를 teamB에도 소속시켜 다중 팀 소속 상황을 만든다.
    await addMembership(teamB.teamId, teamA.leaderId, 'member');

    const scheduleB = await scheduleService.createSchedule('leader', teamB.teamId, teamB.leaderId, {
      title: 'B팀 일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [teamA.leaderId],
    });

    const beforeMsgCountA = await countMessagesByTeam(teamA.teamId);

    await expect(
      changeRequestService.createChangeRequest(teamA.teamId, scheduleB.id, teamA.leaderId, {
        reason: '다중 팀 소속 엣지 케이스',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(await countMessagesByTeam(teamA.teamId)).toBe(beforeMsgCountA);
    expect(await countChangeRequestsByRequester(teamA.leaderId)).toBe(0);
  });
});
