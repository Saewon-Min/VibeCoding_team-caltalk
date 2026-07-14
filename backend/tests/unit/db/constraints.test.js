require('dotenv').config();

const { pool } = require('../../../src/db/pool');

async function createUser(email) {
  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash) VALUES ('DB-19 테스트유저', $1, 'x')
     RETURNING id`,
    [email],
  );
  return result.rows[0].id;
}

async function createTeam(name, creatorId) {
  const result = await pool.query('INSERT INTO teams (name, created_by) VALUES ($1, $2) RETURNING id', [
    name,
    creatorId,
  ]);
  return result.rows[0].id;
}

async function createSchedule(teamId, creatorId, { startAt, endAt } = {}) {
  const result = await pool.query(
    `INSERT INTO schedules (team_id, title, start_at, end_at, created_by)
     VALUES ($1, 'DB-19 테스트 일정', $2, $3, $4)
     RETURNING id`,
    [teamId, startAt ?? '2026-07-21T09:00:00.000Z', endAt ?? '2026-07-21T10:00:00.000Z', creatorId],
  );
  return result.rows[0].id;
}

async function createMessage(teamId, authorId, content) {
  const result = await pool.query(
    `INSERT INTO messages (team_id, author_id, message_type, content)
     VALUES ($1, $2, 'general', $3)
     RETURNING id`,
    [teamId, authorId, content],
  );
  return result.rows[0].id;
}

function suffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

// DB-19: BR-06/09/11/12/13(구 트리거 대상)은 여기서 재검증하지 않는다 — BE-25(백엔드 통합 QA)의
// 책임이다. 이 테스트는 DB 계층이 실제로 소유하는 구조적 제약(UNIQUE/CHECK)만 재확인한다.
describe('DB-19 DB 레벨 제약 통합 검증', () => {
  const createdUserIds = [];
  const createdTeamIds = [];

  afterAll(async () => {
    for (const teamId of createdTeamIds) {
      await pool.query('DELETE FROM team_memberships WHERE team_id = $1', [teamId]);
      await pool.query('DELETE FROM teams WHERE id = $1', [teamId]);
    }
    for (const id of createdUserIds) {
      await pool.query('DELETE FROM users WHERE id = $1', [id]);
    }
    await pool.end();
  });

  test('users.email UNIQUE 제약을 위반하면 unique_violation(23505)이 발생한다', async () => {
    const email = `db19-dup-${suffix()}@test.com`;
    createdUserIds.push(await createUser(email));

    await expect(createUser(email)).rejects.toMatchObject({ code: '23505' });
  });

  test('team_memberships(team_id, user_id) UNIQUE 제약을 위반하면 unique_violation(23505)이 발생한다', async () => {
    const userId = await createUser(`db19-tm-${suffix()}@test.com`);
    createdUserIds.push(userId);
    const teamId = await createTeam(`db19팀-${suffix()}`, userId);
    createdTeamIds.push(teamId);
    await pool.query(`INSERT INTO team_memberships (team_id, user_id, role) VALUES ($1, $2, 'leader')`, [
      teamId,
      userId,
    ]);

    await expect(
      pool.query(`INSERT INTO team_memberships (team_id, user_id, role) VALUES ($1, $2, 'member')`, [
        teamId,
        userId,
      ]),
    ).rejects.toMatchObject({ code: '23505' });
  });

  test('schedule_participants(schedule_id, user_id) UNIQUE 제약을 위반하면 unique_violation(23505)이 발생한다', async () => {
    const userId = await createUser(`db19-sp-${suffix()}@test.com`);
    createdUserIds.push(userId);
    const teamId = await createTeam(`db19팀-${suffix()}`, userId);
    createdTeamIds.push(teamId);
    const scheduleId = await createSchedule(teamId, userId);
    await pool.query('INSERT INTO schedule_participants (schedule_id, user_id) VALUES ($1, $2)', [
      scheduleId,
      userId,
    ]);

    await expect(
      pool.query('INSERT INTO schedule_participants (schedule_id, user_id) VALUES ($1, $2)', [
        scheduleId,
        userId,
      ]),
    ).rejects.toMatchObject({ code: '23505' });
  });

  test('schedule_change_requests.message_id UNIQUE 제약을 위반하면 unique_violation(23505)이 발생한다', async () => {
    const userId = await createUser(`db19-cr-${suffix()}@test.com`);
    createdUserIds.push(userId);
    const teamId = await createTeam(`db19팀-${suffix()}`, userId);
    createdTeamIds.push(teamId);
    const scheduleId = await createSchedule(teamId, userId);
    const messageId = await createMessage(teamId, userId, '변경 요청 메시지');
    await pool.query(
      `INSERT INTO schedule_change_requests (schedule_id, message_id, requester_id, reason)
       VALUES ($1, $2, $3, '사유')`,
      [scheduleId, messageId, userId],
    );

    await expect(
      pool.query(
        `INSERT INTO schedule_change_requests (schedule_id, message_id, requester_id, reason)
         VALUES ($1, $2, $3, '동일 message_id 재사용')`,
        [scheduleId, messageId, userId],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  test('schedules.end_at > start_at CHECK 제약을 위반하면 check_violation(23514)이 발생한다', async () => {
    const userId = await createUser(`db19-sched-${suffix()}@test.com`);
    createdUserIds.push(userId);
    const teamId = await createTeam(`db19팀-${suffix()}`, userId);
    createdTeamIds.push(teamId);

    await expect(
      createSchedule(teamId, userId, {
        startAt: '2026-07-21T10:00:00.000Z',
        endAt: '2026-07-21T09:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: '23514' });
  });

  test('messages: message_type=system이면서 author_id가 있으면 check_violation(23514)이 발생한다', async () => {
    const userId = await createUser(`db19-msg-sys-${suffix()}@test.com`);
    createdUserIds.push(userId);
    const teamId = await createTeam(`db19팀-${suffix()}`, userId);
    createdTeamIds.push(teamId);

    await expect(
      pool.query(
        `INSERT INTO messages (team_id, author_id, message_type, content)
         VALUES ($1, $2, 'system', '작성자가 있으면 안 되는 시스템 메시지')`,
        [teamId, userId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  test('messages: message_type=general이면서 author_id가 없으면 check_violation(23514)이 발생한다', async () => {
    const userId = await createUser(`db19-msg-gen-${suffix()}@test.com`);
    createdUserIds.push(userId);
    const teamId = await createTeam(`db19팀-${suffix()}`, userId);
    createdTeamIds.push(teamId);

    await expect(
      pool.query(
        `INSERT INTO messages (team_id, author_id, message_type, content)
         VALUES ($1, NULL, 'general', '작성자가 없으면 안 되는 일반 메시지')`,
        [teamId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
