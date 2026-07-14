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

async function setChangeRequestStatus(id, status) {
  await pool.query('UPDATE schedule_change_requests SET status = $1 WHERE id = $2', [status, id]);
}

async function getScheduleRow(id) {
  const result = await pool.query(
    'SELECT title, start_at AS "startAt", end_at AS "endAt" FROM schedules WHERE id = $1',
    [id],
  );
  return result.rows[0];
}

async function getRecentSystemMessages(teamId, limit) {
  const result = await pool.query(
    `SELECT id, team_id AS "teamId", author_id AS "authorId",
            message_type AS "messageType", content
       FROM messages WHERE team_id = $1 AND message_type = 'system'
       ORDER BY id DESC LIMIT $2`,
    [teamId, limit],
  );
  return result.rows;
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

describe('change-request.service — BE-19 목록/상세 조회 (BR-16)', () => {
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
    const leaderId = await createUser('팀장', `cr-list-leader-${suffix}@test.com`);
    createdUserIds.push(leaderId);
    const teamId = await createTeamWithLeader(`변경요청조회테스트팀-${suffix}`, leaderId);
    createdTeamIds.push(teamId);

    const memberIds = [];
    for (let i = 0; i < memberCount; i += 1) {
      const memberId = await createUser(`팀원${i}`, `cr-list-member${i}-${suffix}@test.com`);
      createdUserIds.push(memberId);
      await addMembership(teamId, memberId, 'member');
      memberIds.push(memberId);
    }

    return { leaderId, teamId, memberIds };
  }

  test('목록 조회: 특정 팀 소속 change-request만 반환되고 다른 팀 요청은 섞이지 않는다', async () => {
    const teamA = await setupTeam({ memberCount: 0 });
    const teamB = await setupTeam({ memberCount: 0 });

    const scheduleA = await scheduleService.createSchedule('leader', teamA.teamId, teamA.leaderId, {
      title: 'A팀 일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [teamA.leaderId],
    });
    const scheduleB = await scheduleService.createSchedule('leader', teamB.teamId, teamB.leaderId, {
      title: 'B팀 일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [teamB.leaderId],
    });

    const crA = await changeRequestService.createChangeRequest(
      teamA.teamId,
      scheduleA.id,
      teamA.leaderId,
      { reason: 'A팀 요청' },
    );
    const crB = await changeRequestService.createChangeRequest(
      teamB.teamId,
      scheduleB.id,
      teamB.leaderId,
      { reason: 'B팀 요청' },
    );

    const listA = await changeRequestService.listChangeRequests(teamA.teamId);
    const listB = await changeRequestService.listChangeRequests(teamB.teamId);

    expect(listA.map((cr) => cr.id)).toEqual([crA.id]);
    expect(listB.map((cr) => cr.id)).toEqual([crB.id]);
    expect(listA.some((cr) => cr.id === crB.id)).toBe(false);
    expect(listB.some((cr) => cr.id === crA.id)).toBe(false);
  });

  test('목록 정렬: 생성 순서대로 createdAt 오름차순으로 정렬되어 반환된다', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
    const schedule = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [leaderId],
    });

    const cr1 = await changeRequestService.createChangeRequest(teamId, schedule.id, leaderId, {
      reason: '첫번째 요청',
    });
    const cr2 = await changeRequestService.createChangeRequest(teamId, schedule.id, leaderId, {
      reason: '두번째 요청',
    });
    const cr3 = await changeRequestService.createChangeRequest(teamId, schedule.id, leaderId, {
      reason: '세번째 요청',
    });

    const list = await changeRequestService.listChangeRequests(teamId);

    expect(list.map((cr) => cr.id)).toEqual([cr1.id, cr2.id, cr3.id]);
    for (let i = 1; i < list.length; i += 1) {
      expect(new Date(list[i].createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(list[i - 1].createdAt).getTime(),
      );
    }
  });

  test('scheduleId 필터: 지정한 일정에 속한 change-request만 반환된다', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
    const schedule1 = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '일정1',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [leaderId],
    });
    const schedule2 = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '일정2',
      startAt: '2026-07-14T11:00:00.000Z',
      endAt: '2026-07-14T12:00:00.000Z',
      participantUserIds: [leaderId],
    });

    const cr1 = await changeRequestService.createChangeRequest(teamId, schedule1.id, leaderId, {
      reason: '일정1 요청',
    });
    await changeRequestService.createChangeRequest(teamId, schedule2.id, leaderId, {
      reason: '일정2 요청',
    });

    const filtered = await changeRequestService.listChangeRequests(teamId, {
      scheduleId: schedule1.id,
    });

    expect(filtered.map((cr) => cr.id)).toEqual([cr1.id]);
    expect(filtered.every((cr) => cr.scheduleId === schedule1.id)).toBe(true);
  });

  test('status 필터: pending/approved/rejected/cancelled 각각 정확히 필터링된다', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
    const schedule = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [leaderId],
    });

    const crPending = await changeRequestService.createChangeRequest(teamId, schedule.id, leaderId, {
      reason: 'pending 요청',
    });
    const crApproved = await changeRequestService.createChangeRequest(teamId, schedule.id, leaderId, {
      reason: 'approved 요청',
    });
    const crRejected = await changeRequestService.createChangeRequest(teamId, schedule.id, leaderId, {
      reason: 'rejected 요청',
    });
    const crCancelled = await changeRequestService.createChangeRequest(teamId, schedule.id, leaderId, {
      reason: 'cancelled 요청',
    });

    await setChangeRequestStatus(crApproved.id, 'approved');
    await setChangeRequestStatus(crRejected.id, 'rejected');
    await setChangeRequestStatus(crCancelled.id, 'cancelled');

    const pendingList = await changeRequestService.listChangeRequests(teamId, { status: 'pending' });
    const approvedList = await changeRequestService.listChangeRequests(teamId, { status: 'approved' });
    const rejectedList = await changeRequestService.listChangeRequests(teamId, { status: 'rejected' });
    const cancelledList = await changeRequestService.listChangeRequests(teamId, {
      status: 'cancelled',
    });

    expect(pendingList.map((cr) => cr.id)).toEqual([crPending.id]);
    expect(approvedList.map((cr) => cr.id)).toEqual([crApproved.id]);
    expect(rejectedList.map((cr) => cr.id)).toEqual([crRejected.id]);
    expect(cancelledList.map((cr) => cr.id)).toEqual([crCancelled.id]);
  });

  test('잘못된 status 값을 전달하면 400 에러가 발생한다', async () => {
    const { teamId } = await setupTeam({ memberCount: 0 });

    await expect(
      changeRequestService.listChangeRequests(teamId, { status: 'invalid-status' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('change-request가 없는 팀은 빈 배열을 반환한다', async () => {
    const { teamId } = await setupTeam({ memberCount: 0 });

    const list = await changeRequestService.listChangeRequests(teamId);

    expect(list).toEqual([]);
  });

  test('다른 팀 소속 scheduleId로 필터링하면 빈 배열을 반환한다 (에러 아님)', async () => {
    const teamA = await setupTeam({ memberCount: 0 });
    const teamB = await setupTeam({ memberCount: 0 });

    const scheduleB = await scheduleService.createSchedule('leader', teamB.teamId, teamB.leaderId, {
      title: 'B팀 일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [teamB.leaderId],
    });
    await changeRequestService.createChangeRequest(teamB.teamId, scheduleB.id, teamB.leaderId, {
      reason: 'B팀 요청',
    });

    const list = await changeRequestService.listChangeRequests(teamA.teamId, {
      scheduleId: scheduleB.id,
    });

    expect(list).toEqual([]);
  });

  test('상세 조회 성공: 생성한 요청과 동일한 필드값을 반환하며 teamId 필드는 없다', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
    const schedule = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [leaderId],
    });

    const created = await changeRequestService.createChangeRequest(teamId, schedule.id, leaderId, {
      reason: '상세 조회 테스트',
    });

    const detail = await changeRequestService.getChangeRequestById(teamId, created.id);

    expect(detail).toMatchObject({
      id: created.id,
      scheduleId: schedule.id,
      messageId: created.messageId,
      requesterId: leaderId,
      proposedTitle: null,
      proposedStartAt: null,
      proposedEndAt: null,
      reason: '상세 조회 테스트',
      status: 'pending',
      processedBy: null,
      processedAt: null,
    });
    expect(detail).not.toHaveProperty('teamId');
  });

  test('존재하지 않는 requestId면 404가 발생한다', async () => {
    const { teamId } = await setupTeam({ memberCount: 0 });
    const nonExistentId = 999999999;

    await expect(
      changeRequestService.getChangeRequestById(teamId, nonExistentId),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('다른 팀 소속 요청을 자신의 teamId로 조회하면 404가 발생한다 (BR-16)', async () => {
    const teamA = await setupTeam({ memberCount: 0 });
    const teamB = await setupTeam({ memberCount: 0 });

    const scheduleB = await scheduleService.createSchedule('leader', teamB.teamId, teamB.leaderId, {
      title: 'B팀 일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [teamB.leaderId],
    });
    const crB = await changeRequestService.createChangeRequest(
      teamB.teamId,
      scheduleB.id,
      teamB.leaderId,
      { reason: 'B팀 요청' },
    );

    await expect(
      changeRequestService.getChangeRequestById(teamA.teamId, crB.id),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('change-request.service — BE-20 변경 요청 승인 처리 (BR-05/BR-11/BR-13)', () => {
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
    const leaderId = await createUser('팀장', `cr-approve-leader-${suffix}@test.com`);
    createdUserIds.push(leaderId);
    const teamId = await createTeamWithLeader(`변경요청승인테스트팀-${suffix}`, leaderId);
    createdTeamIds.push(teamId);

    const memberIds = [];
    for (let i = 0; i < memberCount; i += 1) {
      const memberId = await createUser(`팀원${i}`, `cr-approve-member${i}-${suffix}@test.com`);
      createdUserIds.push(memberId);
      await addMembership(teamId, memberId, 'member');
      memberIds.push(memberId);
    }

    return { leaderId, teamId, memberIds };
  }

  test('팀장이 제안 값(title+startAt+endAt) 포함 요청을 승인하면 status가 approved, processedBy/processedAt이 채워지고 schedule에 제안 값이 반영된다', async () => {
    const { leaderId, teamId, memberIds } = await setupTeam({ memberCount: 1 });
    const memberId = memberIds[0];
    const schedule = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '원래 제목',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [memberId],
    });

    const proposedTitle = '변경된 제목';
    const proposedStartAt = '2026-07-15T09:00:00.000Z';
    const proposedEndAt = '2026-07-15T10:00:00.000Z';

    const cr = await changeRequestService.createChangeRequest(teamId, schedule.id, memberId, {
      reason: '시간 변경 요청',
      proposedTitle,
      proposedStartAt,
      proposedEndAt,
    });

    const result = await changeRequestService.approveChangeRequest('leader', teamId, cr.id, leaderId);

    expect(result.id).toBe(cr.id);
    expect(result.status).toBe('approved');
    expect(result.processedBy).toBe(leaderId);
    expect(result.processedAt).not.toBeNull();

    const crRow = await getChangeRequestRow(cr.id);
    expect(crRow.status).toBe('approved');
    expect(crRow.processedBy).toBe(leaderId);
    expect(crRow.processedAt).not.toBeNull();

    const scheduleRow = await getScheduleRow(schedule.id);
    expect(scheduleRow.title).toBe(proposedTitle);
    expect(new Date(scheduleRow.startAt).toISOString()).toBe(proposedStartAt);
    expect(new Date(scheduleRow.endAt).toISOString()).toBe(proposedEndAt);
  });

  test('제안 값이 전부 null인 요청(reason만 있는 요청)을 승인해도 schedule 값은 전혀 변경되지 않는다', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
    const originalTitle = '원래 제목';
    const originalStartAt = '2026-07-14T09:00:00.000Z';
    const originalEndAt = '2026-07-14T10:00:00.000Z';
    const schedule = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: originalTitle,
      startAt: originalStartAt,
      endAt: originalEndAt,
      participantUserIds: [leaderId],
    });

    const cr = await changeRequestService.createChangeRequest(teamId, schedule.id, leaderId, {
      reason: '얘기만 하고 싶어요',
    });

    const result = await changeRequestService.approveChangeRequest('leader', teamId, cr.id, leaderId);
    expect(result.status).toBe('approved');

    const scheduleRow = await getScheduleRow(schedule.id);
    expect(scheduleRow.title).toBe(originalTitle);
    expect(new Date(scheduleRow.startAt).toISOString()).toBe(originalStartAt);
    expect(new Date(scheduleRow.endAt).toISOString()).toBe(originalEndAt);
  });

  test('동일 schedule_id에 다른 pending 요청이 2개 더 있을 때, 하나를 승인하면 나머지 둘 다 rejected로 전환되고 processedBy가 승인자로 설정된다 (BR-11)', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
    const schedule = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [leaderId],
    });

    const cr1 = await changeRequestService.createChangeRequest(teamId, schedule.id, leaderId, {
      reason: '요청1',
    });
    const cr2 = await changeRequestService.createChangeRequest(teamId, schedule.id, leaderId, {
      reason: '요청2',
    });
    const cr3 = await changeRequestService.createChangeRequest(teamId, schedule.id, leaderId, {
      reason: '요청3',
    });

    await changeRequestService.approveChangeRequest('leader', teamId, cr1.id, leaderId);

    const cr2Row = await getChangeRequestRow(cr2.id);
    const cr3Row = await getChangeRequestRow(cr3.id);
    expect(cr2Row.status).toBe('rejected');
    expect(cr2Row.processedBy).toBe(leaderId);
    expect(cr3Row.status).toBe('rejected');
    expect(cr3Row.processedBy).toBe(leaderId);
  });

  test('다른 schedule_id에 속한 pending 요청은 영향받지 않는다', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
    const scheduleA = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '일정A',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [leaderId],
    });
    const scheduleB = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '일정B',
      startAt: '2026-07-14T11:00:00.000Z',
      endAt: '2026-07-14T12:00:00.000Z',
      participantUserIds: [leaderId],
    });

    const crA = await changeRequestService.createChangeRequest(teamId, scheduleA.id, leaderId, {
      reason: 'A요청',
    });
    const crB = await changeRequestService.createChangeRequest(teamId, scheduleB.id, leaderId, {
      reason: 'B요청',
    });

    await changeRequestService.approveChangeRequest('leader', teamId, crA.id, leaderId);

    const crBRow = await getChangeRequestRow(crB.id);
    expect(crBRow.status).toBe('pending');
    expect(crBRow.processedBy).toBeNull();
  });

  test('이미 approved/rejected/cancelled 처리된 동일 schedule의 요청은 자동 거절 대상에서 제외되어 재처리되지 않는다', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
    const schedule = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [leaderId],
    });

    const crTarget = await changeRequestService.createChangeRequest(teamId, schedule.id, leaderId, {
      reason: '승인 대상',
    });
    const crApproved = await changeRequestService.createChangeRequest(teamId, schedule.id, leaderId, {
      reason: '이미 승인됨',
    });
    const crRejected = await changeRequestService.createChangeRequest(teamId, schedule.id, leaderId, {
      reason: '이미 거절됨',
    });
    const crCancelled = await changeRequestService.createChangeRequest(teamId, schedule.id, leaderId, {
      reason: '이미 취소됨',
    });

    await setChangeRequestStatus(crApproved.id, 'approved');
    await setChangeRequestStatus(crRejected.id, 'rejected');
    await setChangeRequestStatus(crCancelled.id, 'cancelled');

    await changeRequestService.approveChangeRequest('leader', teamId, crTarget.id, leaderId);

    const approvedRow = await getChangeRequestRow(crApproved.id);
    const rejectedRow = await getChangeRequestRow(crRejected.id);
    const cancelledRow = await getChangeRequestRow(crCancelled.id);

    expect(approvedRow.status).toBe('approved');
    expect(approvedRow.processedBy).toBeNull();
    expect(rejectedRow.status).toBe('rejected');
    expect(rejectedRow.processedBy).toBeNull();
    expect(cancelledRow.status).toBe('cancelled');
    expect(cancelledRow.processedBy).toBeNull();
  });

  test('승인 시 시스템 메시지가 생성되고, 자동 거절된 요청 수만큼 추가 시스템 메시지가 생성된다 (BR-13)', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
    const schedule = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [leaderId],
    });

    const cr1 = await changeRequestService.createChangeRequest(teamId, schedule.id, leaderId, {
      reason: '요청1',
    });
    await changeRequestService.createChangeRequest(teamId, schedule.id, leaderId, {
      reason: '요청2',
    });
    await changeRequestService.createChangeRequest(teamId, schedule.id, leaderId, {
      reason: '요청3',
    });

    const beforeMsgCount = await countMessagesByTeam(teamId);

    await changeRequestService.approveChangeRequest('leader', teamId, cr1.id, leaderId);

    const afterMsgCount = await countMessagesByTeam(teamId);
    expect(afterMsgCount).toBe(beforeMsgCount + 3);

    const recentSystemMessages = await getRecentSystemMessages(teamId, 3);
    expect(recentSystemMessages.length).toBe(3);
    for (const msg of recentSystemMessages) {
      expect(msg.authorId).toBeNull();
      expect(msg.messageType).toBe('system');
      expect(msg.teamId).toBe(teamId);
    }
  });

  test('팀원이 승인 시도하면 403이 발생하고 아무 것도 변경되지 않는다', async () => {
    const { leaderId, teamId, memberIds } = await setupTeam({ memberCount: 1 });
    const memberId = memberIds[0];
    const schedule = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [memberId],
    });

    const cr = await changeRequestService.createChangeRequest(teamId, schedule.id, memberId, {
      reason: '팀원 요청',
      proposedTitle: '변경 시도',
      proposedStartAt: '2026-07-15T09:00:00.000Z',
      proposedEndAt: '2026-07-15T10:00:00.000Z',
    });

    const beforeMsgCount = await countMessagesByTeam(teamId);

    await expect(
      changeRequestService.approveChangeRequest('member', teamId, cr.id, memberId),
    ).rejects.toMatchObject({ statusCode: 403 });

    const crRow = await getChangeRequestRow(cr.id);
    expect(crRow.status).toBe('pending');
    expect(crRow.processedBy).toBeNull();

    const scheduleRow = await getScheduleRow(schedule.id);
    expect(scheduleRow.title).toBe('일정');

    expect(await countMessagesByTeam(teamId)).toBe(beforeMsgCount);
  });

  test('존재하지 않는 requestId면 404가 발생한다', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
    const nonExistentId = 999999999;

    await expect(
      changeRequestService.approveChangeRequest('leader', teamId, nonExistentId, leaderId),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('다른 팀 소속 요청을 자신의 teamId로 승인 시도하면 404가 발생한다', async () => {
    const teamA = await setupTeam({ memberCount: 0 });
    const teamB = await setupTeam({ memberCount: 0 });

    const scheduleB = await scheduleService.createSchedule('leader', teamB.teamId, teamB.leaderId, {
      title: 'B팀 일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [teamB.leaderId],
    });
    const crB = await changeRequestService.createChangeRequest(
      teamB.teamId,
      scheduleB.id,
      teamB.leaderId,
      { reason: 'B팀 요청' },
    );

    await expect(
      changeRequestService.approveChangeRequest('leader', teamA.teamId, crB.id, teamA.leaderId),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('이미 처리된(pending 아닌) 요청을 재승인 시도하면 409이며 아무 것도 변경되지 않는다 (SC-07 E2 / SC-09 E1)', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
    const schedule = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [leaderId],
    });

    const cr = await changeRequestService.createChangeRequest(teamId, schedule.id, leaderId, {
      reason: '이미 처리됨',
      proposedTitle: '변경 시도 제목',
      proposedStartAt: '2026-07-15T09:00:00.000Z',
      proposedEndAt: '2026-07-15T10:00:00.000Z',
    });
    await setChangeRequestStatus(cr.id, 'rejected');

    const beforeMsgCount = await countMessagesByTeam(teamId);

    await expect(
      changeRequestService.approveChangeRequest('leader', teamId, cr.id, leaderId),
    ).rejects.toMatchObject({ statusCode: 409 });

    const crRow = await getChangeRequestRow(cr.id);
    expect(crRow.status).toBe('rejected');
    expect(crRow.processedBy).toBeNull();

    const scheduleRow = await getScheduleRow(schedule.id);
    expect(scheduleRow.title).toBe('일정');

    expect(await countMessagesByTeam(teamId)).toBe(beforeMsgCount);
  });
});

describe('change-request.service — BE-21 변경 요청 거절 처리 (BR-05/BR-13)', () => {
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
    const leaderId = await createUser('팀장', `cr-reject-leader-${suffix}@test.com`);
    createdUserIds.push(leaderId);
    const teamId = await createTeamWithLeader(`변경요청거절테스트팀-${suffix}`, leaderId);
    createdTeamIds.push(teamId);

    const memberIds = [];
    for (let i = 0; i < memberCount; i += 1) {
      const memberId = await createUser(`팀원${i}`, `cr-reject-member${i}-${suffix}@test.com`);
      createdUserIds.push(memberId);
      await addMembership(teamId, memberId, 'member');
      memberIds.push(memberId);
    }

    return { leaderId, teamId, memberIds };
  }

  test('팀장이 거절하면 status가 rejected, processedBy/processedAt이 채워지고 Schedule은 변경되지 않는다 (SC-08)', async () => {
    const { leaderId, teamId, memberIds } = await setupTeam({ memberCount: 1 });
    const memberId = memberIds[0];
    const originalTitle = '원래 제목';
    const originalStartAt = '2026-07-14T09:00:00.000Z';
    const originalEndAt = '2026-07-14T10:00:00.000Z';
    const schedule = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: originalTitle,
      startAt: originalStartAt,
      endAt: originalEndAt,
      participantUserIds: [memberId],
    });

    const cr = await changeRequestService.createChangeRequest(teamId, schedule.id, memberId, {
      reason: '거절될 요청',
      proposedTitle: '변경 시도 제목',
      proposedStartAt: '2026-07-15T09:00:00.000Z',
      proposedEndAt: '2026-07-15T10:00:00.000Z',
    });

    const result = await changeRequestService.rejectChangeRequest('leader', teamId, cr.id, leaderId);

    expect(result.id).toBe(cr.id);
    expect(result.status).toBe('rejected');
    expect(result.processedBy).toBe(leaderId);
    expect(result.processedAt).not.toBeNull();

    const crRow = await getChangeRequestRow(cr.id);
    expect(crRow.status).toBe('rejected');
    expect(crRow.processedBy).toBe(leaderId);

    const scheduleRow = await getScheduleRow(schedule.id);
    expect(scheduleRow.title).toBe(originalTitle);
    expect(new Date(scheduleRow.startAt).toISOString()).toBe(originalStartAt);
    expect(new Date(scheduleRow.endAt).toISOString()).toBe(originalEndAt);
  });

  test('거절 시 시스템 메시지가 정확히 1건 생성된다 (BR-13)', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
    const schedule = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [leaderId],
    });
    const cr = await changeRequestService.createChangeRequest(teamId, schedule.id, leaderId, {
      reason: '거절 대상',
    });

    const beforeMsgCount = await countMessagesByTeam(teamId);
    await changeRequestService.rejectChangeRequest('leader', teamId, cr.id, leaderId);
    const afterMsgCount = await countMessagesByTeam(teamId);

    expect(afterMsgCount).toBe(beforeMsgCount + 1);
    const recentSystemMessages = await getRecentSystemMessages(teamId, 1);
    expect(recentSystemMessages.length).toBe(1);
    expect(recentSystemMessages[0].authorId).toBeNull();
    expect(recentSystemMessages[0].messageType).toBe('system');
  });

  test('팀원이 거절 시도하면 403이 발생하고 아무 것도 변경되지 않는다', async () => {
    const { leaderId, teamId, memberIds } = await setupTeam({ memberCount: 1 });
    const memberId = memberIds[0];
    const schedule = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [memberId],
    });
    const cr = await changeRequestService.createChangeRequest(teamId, schedule.id, memberId, {
      reason: '팀원 요청',
    });

    const beforeMsgCount = await countMessagesByTeam(teamId);

    await expect(
      changeRequestService.rejectChangeRequest('member', teamId, cr.id, memberId),
    ).rejects.toMatchObject({ statusCode: 403 });

    const crRow = await getChangeRequestRow(cr.id);
    expect(crRow.status).toBe('pending');
    expect(crRow.processedBy).toBeNull();
    expect(await countMessagesByTeam(teamId)).toBe(beforeMsgCount);
  });

  test('타 팀 팀장이 자신의 teamId로 다른 팀 요청을 거절 시도하면 404가 발생한다 (SC-08 E1, BR-16 팀 경계 — BE-19/20과 동일 컨벤션)', async () => {
    const teamA = await setupTeam({ memberCount: 0 });
    const teamB = await setupTeam({ memberCount: 0 });

    const scheduleA = await scheduleService.createSchedule('leader', teamA.teamId, teamA.leaderId, {
      title: 'A팀 일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [teamA.leaderId],
    });
    const crA = await changeRequestService.createChangeRequest(
      teamA.teamId,
      scheduleA.id,
      teamA.leaderId,
      { reason: 'A팀 요청' },
    );

    // teamAccessMiddleware가 req.teamMembership.teamId를 teamB로 고정하므로, actorRole 자체는
    // leader이지만 requestId가 teamB 소속이 아니라 서비스 계층 소속 검증에서 404로 귀결된다.
    await expect(
      changeRequestService.rejectChangeRequest('leader', teamB.teamId, crA.id, teamB.leaderId),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('존재하지 않는 requestId면 404가 발생한다', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
    const nonExistentId = 999999999;

    await expect(
      changeRequestService.rejectChangeRequest('leader', teamId, nonExistentId, leaderId),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('이미 처리된(pending 아닌) 요청을 재거절 시도하면 409이며 아무 것도 변경되지 않는다', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
    const schedule = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [leaderId],
    });
    const cr = await changeRequestService.createChangeRequest(teamId, schedule.id, leaderId, {
      reason: '이미 처리됨',
    });
    await setChangeRequestStatus(cr.id, 'approved');

    const beforeMsgCount = await countMessagesByTeam(teamId);

    await expect(
      changeRequestService.rejectChangeRequest('leader', teamId, cr.id, leaderId),
    ).rejects.toMatchObject({ statusCode: 409 });

    const crRow = await getChangeRequestRow(cr.id);
    expect(crRow.status).toBe('approved');
    expect(await countMessagesByTeam(teamId)).toBe(beforeMsgCount);
  });
});

describe('change-request.service — BE-22 변경 요청 취소 (BR-12)', () => {
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
    const leaderId = await createUser('팀장', `cr-cancel-leader-${suffix}@test.com`);
    createdUserIds.push(leaderId);
    const teamId = await createTeamWithLeader(`변경요청취소테스트팀-${suffix}`, leaderId);
    createdTeamIds.push(teamId);

    const memberIds = [];
    for (let i = 0; i < memberCount; i += 1) {
      const memberId = await createUser(`팀원${i}`, `cr-cancel-member${i}-${suffix}@test.com`);
      createdUserIds.push(memberId);
      await addMembership(teamId, memberId, 'member');
      memberIds.push(memberId);
    }

    return { leaderId, teamId, memberIds };
  }

  test('요청자 본인이 취소하면 status가 cancelled, processedBy/processedAt이 채워지고 Schedule은 변경되지 않는다 (SC-10)', async () => {
    const { leaderId, teamId, memberIds } = await setupTeam({ memberCount: 1 });
    const memberId = memberIds[0];
    const originalTitle = '원래 제목';
    const originalStartAt = '2026-07-14T09:00:00.000Z';
    const originalEndAt = '2026-07-14T10:00:00.000Z';
    const schedule = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: originalTitle,
      startAt: originalStartAt,
      endAt: originalEndAt,
      participantUserIds: [memberId],
    });

    const cr = await changeRequestService.createChangeRequest(teamId, schedule.id, memberId, {
      reason: '취소될 요청',
      proposedTitle: '변경 시도 제목',
      proposedStartAt: '2026-07-15T09:00:00.000Z',
      proposedEndAt: '2026-07-15T10:00:00.000Z',
    });

    const result = await changeRequestService.cancelChangeRequest(teamId, cr.id, memberId);

    expect(result.id).toBe(cr.id);
    expect(result.status).toBe('cancelled');
    expect(result.processedBy).toBe(memberId);
    expect(result.processedAt).not.toBeNull();

    const crRow = await getChangeRequestRow(cr.id);
    expect(crRow.status).toBe('cancelled');
    expect(crRow.processedBy).toBe(memberId);

    const scheduleRow = await getScheduleRow(schedule.id);
    expect(scheduleRow.title).toBe(originalTitle);
    expect(new Date(scheduleRow.startAt).toISOString()).toBe(originalStartAt);
    expect(new Date(scheduleRow.endAt).toISOString()).toBe(originalEndAt);
  });

  test('취소 시 시스템 메시지가 정확히 1건 생성되고, 팀장의 pending 목록 조회에서 제외된다 (SC-10)', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
    const schedule = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [leaderId],
    });
    const cr = await changeRequestService.createChangeRequest(teamId, schedule.id, leaderId, {
      reason: '취소 대상',
    });

    const beforeMsgCount = await countMessagesByTeam(teamId);
    await changeRequestService.cancelChangeRequest(teamId, cr.id, leaderId);
    const afterMsgCount = await countMessagesByTeam(teamId);

    expect(afterMsgCount).toBe(beforeMsgCount + 1);
    const recentSystemMessages = await getRecentSystemMessages(teamId, 1);
    expect(recentSystemMessages.length).toBe(1);
    expect(recentSystemMessages[0].authorId).toBeNull();
    expect(recentSystemMessages[0].messageType).toBe('system');

    const pendingList = await changeRequestService.listChangeRequests(teamId, { status: 'pending' });
    expect(pendingList.some((item) => item.id === cr.id)).toBe(false);
  });

  test('요청자 본인이 아닌 사용자(같은 팀 팀원)가 취소 시도하면 403이 발생하고 아무 것도 변경되지 않는다 (SC-10 E2)', async () => {
    const { leaderId, teamId, memberIds } = await setupTeam({ memberCount: 2 });
    const [requester, other] = memberIds;
    const schedule = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [requester, other],
    });
    const cr = await changeRequestService.createChangeRequest(teamId, schedule.id, requester, {
      reason: '본인 요청',
    });

    const beforeMsgCount = await countMessagesByTeam(teamId);

    await expect(
      changeRequestService.cancelChangeRequest(teamId, cr.id, other),
    ).rejects.toMatchObject({ statusCode: 403 });

    const crRow = await getChangeRequestRow(cr.id);
    expect(crRow.status).toBe('pending');
    expect(crRow.processedBy).toBeNull();
    expect(await countMessagesByTeam(teamId)).toBe(beforeMsgCount);
  });

  test('요청자 본인이 아닌 팀장이 취소 시도해도 403이 발생한다 (BR-12는 역할 무관, 본인 여부만 검증)', async () => {
    const { leaderId, teamId, memberIds } = await setupTeam({ memberCount: 1 });
    const memberId = memberIds[0];
    const schedule = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [memberId],
    });
    const cr = await changeRequestService.createChangeRequest(teamId, schedule.id, memberId, {
      reason: '팀원 요청',
    });

    await expect(
      changeRequestService.cancelChangeRequest(teamId, cr.id, leaderId),
    ).rejects.toMatchObject({ statusCode: 403 });

    const crRow = await getChangeRequestRow(cr.id);
    expect(crRow.status).toBe('pending');
  });

  test('존재하지 않는 requestId면 404가 발생한다', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
    const nonExistentId = 999999999;

    await expect(
      changeRequestService.cancelChangeRequest(teamId, nonExistentId, leaderId),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('다른 팀 소속 요청을 자신의 teamId로 취소 시도하면 404가 발생한다 (BR-16 팀 경계)', async () => {
    const teamA = await setupTeam({ memberCount: 0 });
    const teamB = await setupTeam({ memberCount: 0 });

    const scheduleA = await scheduleService.createSchedule('leader', teamA.teamId, teamA.leaderId, {
      title: 'A팀 일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [teamA.leaderId],
    });
    const crA = await changeRequestService.createChangeRequest(
      teamA.teamId,
      scheduleA.id,
      teamA.leaderId,
      { reason: 'A팀 요청' },
    );

    await expect(
      changeRequestService.cancelChangeRequest(teamB.teamId, crA.id, teamA.leaderId),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('이미 처리된(pending 아닌) 요청을 재취소 시도하면 409이며 아무 것도 변경되지 않는다 (SC-10 E1)', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
    const schedule = await scheduleService.createSchedule('leader', teamId, leaderId, {
      title: '일정',
      startAt: '2026-07-14T09:00:00.000Z',
      endAt: '2026-07-14T10:00:00.000Z',
      participantUserIds: [leaderId],
    });
    const cr = await changeRequestService.createChangeRequest(teamId, schedule.id, leaderId, {
      reason: '이미 처리됨',
    });
    await setChangeRequestStatus(cr.id, 'approved');

    const beforeMsgCount = await countMessagesByTeam(teamId);

    await expect(
      changeRequestService.cancelChangeRequest(teamId, cr.id, leaderId),
    ).rejects.toMatchObject({ statusCode: 409 });

    const crRow = await getChangeRequestRow(cr.id);
    expect(crRow.status).toBe('approved');
    expect(await countMessagesByTeam(teamId)).toBe(beforeMsgCount);
  });
});

afterAll(async () => {
  await pool.end();
});
