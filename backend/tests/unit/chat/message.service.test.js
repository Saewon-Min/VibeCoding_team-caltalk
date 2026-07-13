require('dotenv').config();

const { pool } = require('../../../src/db/pool');
const messageService = require('../../../src/modules/chat/message.service');

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
  // messages는 teams FK ON DELETE CASCADE로 함께 삭제된다.
  await pool.query('DELETE FROM team_memberships WHERE team_id = $1', [teamId]);
  await pool.query('DELETE FROM teams WHERE id = $1', [teamId]);
}

async function countMessagesByTeam(teamId) {
  const result = await pool.query('SELECT COUNT(*)::int AS count FROM messages WHERE team_id = $1', [
    teamId,
  ]);
  return result.rows[0].count;
}

describe('message.service — BE-16 채팅 메시지 작성 (BR-01, BR-06, BR-13)', () => {
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
    const leaderId = await createUser('팀장', `chat-leader-${suffix}@test.com`);
    createdUserIds.push(leaderId);
    const teamId = await createTeamWithLeader(`채팅테스트팀-${suffix}`, leaderId);
    createdTeamIds.push(teamId);

    const memberIds = [];
    for (let i = 0; i < memberCount; i += 1) {
      const memberId = await createUser(`팀원${i}`, `chat-member${i}-${suffix}@test.com`);
      createdUserIds.push(memberId);
      await addMembership(teamId, memberId, 'member');
      memberIds.push(memberId);
    }

    return { leaderId, teamId, memberIds };
  }

  describe('createMessage', () => {
    test('팀장이 메시지를 작성하면 messageType=general, authorId=leaderId로 저장된다', async () => {
      const { leaderId, teamId } = await setupTeam({ memberCount: 0 });

      const result = await messageService.createMessage(teamId, leaderId, { content: '안녕하세요' });

      expect(result.teamId).toBe(teamId);
      expect(result.authorId).toBe(leaderId);
      expect(result.messageType).toBe('general');
      expect(result.content).toBe('안녕하세요');
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeDefined();

      const row = await pool.query(
        `SELECT team_id AS "teamId", author_id AS "authorId", message_type AS "messageType", content
           FROM messages WHERE id = $1`,
        [result.id],
      );
      expect(row.rowCount).toBe(1);
      expect(row.rows[0].teamId).toBe(teamId);
      expect(row.rows[0].authorId).toBe(leaderId);
      expect(row.rows[0].messageType).toBe('general');
      expect(row.rows[0].content).toBe('안녕하세요');
    });

    test('팀원이 메시지를 작성해도 성공한다 (역할 제약 없음, BR-01)', async () => {
      const { teamId, memberIds } = await setupTeam({ memberCount: 1 });
      const memberId = memberIds[0];

      const result = await messageService.createMessage(teamId, memberId, { content: '팀원 메시지' });

      expect(result.authorId).toBe(memberId);
      expect(result.messageType).toBe('general');

      const row = await pool.query('SELECT author_id AS "authorId" FROM messages WHERE id = $1', [
        result.id,
      ]);
      expect(row.rows[0].authorId).toBe(memberId);
    });

    test('content가 빈 문자열이면 400이며 DB에 저장되지 않는다', async () => {
      const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
      const beforeCount = await countMessagesByTeam(teamId);

      await expect(
        messageService.createMessage(teamId, leaderId, { content: '' }),
      ).rejects.toMatchObject({ statusCode: 400 });

      const afterCount = await countMessagesByTeam(teamId);
      expect(afterCount).toBe(beforeCount);
    });

    test('content가 공백만이면 400이다', async () => {
      const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
      const beforeCount = await countMessagesByTeam(teamId);

      await expect(
        messageService.createMessage(teamId, leaderId, { content: '   ' }),
      ).rejects.toMatchObject({ statusCode: 400 });

      const afterCount = await countMessagesByTeam(teamId);
      expect(afterCount).toBe(beforeCount);
    });

    test('content가 누락되면 400이다', async () => {
      const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
      const beforeCount = await countMessagesByTeam(teamId);

      await expect(messageService.createMessage(teamId, leaderId, {})).rejects.toMatchObject({
        statusCode: 400,
      });

      const afterCount = await countMessagesByTeam(teamId);
      expect(afterCount).toBe(beforeCount);
    });

    test('content가 문자열이 아니면(숫자) 400이다', async () => {
      const { leaderId, teamId } = await setupTeam({ memberCount: 0 });
      const beforeCount = await countMessagesByTeam(teamId);

      await expect(
        messageService.createMessage(teamId, leaderId, { content: 123 }),
      ).rejects.toMatchObject({ statusCode: 400 });

      const afterCount = await countMessagesByTeam(teamId);
      expect(afterCount).toBe(beforeCount);
    });
  });

  describe('createSystemMessage', () => {
    test('트랜잭션 client로 호출하면 authorId=null, messageType=system으로 저장되고 커밋 후 DB에도 남는다', async () => {
      const { teamId } = await setupTeam({ memberCount: 0 });
      const client = await pool.connect();

      let result;
      try {
        await client.query('BEGIN');
        result = await messageService.createSystemMessage(client, teamId, '시스템 알림 메시지');
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      expect(result.teamId).toBe(teamId);
      expect(result.authorId).toBeNull();
      expect(result.messageType).toBe('system');
      expect(result.content).toBe('시스템 알림 메시지');
      expect(result.id).toBeDefined();

      const row = await pool.query(
        `SELECT author_id AS "authorId", message_type AS "messageType", content
           FROM messages WHERE id = $1`,
        [result.id],
      );
      expect(row.rowCount).toBe(1);
      expect(row.rows[0].authorId).toBeNull();
      expect(row.rows[0].messageType).toBe('system');
      expect(row.rows[0].content).toBe('시스템 알림 메시지');
    });

    test('빈 content를 전달하면 400이다', async () => {
      const { teamId } = await setupTeam({ memberCount: 0 });
      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        await expect(messageService.createSystemMessage(client, teamId, '')).rejects.toMatchObject({
          statusCode: 400,
        });
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });

    test('트랜잭션이 ROLLBACK되면 생성된 메시지가 DB에 남지 않는다', async () => {
      const { teamId } = await setupTeam({ memberCount: 0 });
      const client = await pool.connect();

      let result;
      try {
        await client.query('BEGIN');
        result = await messageService.createSystemMessage(client, teamId, '롤백될 메시지');
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }

      const row = await pool.query('SELECT COUNT(*)::int AS count FROM messages WHERE id = $1', [
        result.id,
      ]);
      expect(row.rows[0].count).toBe(0);
    });
  });

  describe('message.routes — BR-06 메시지 불변성', () => {
    test('PUT/PATCH/DELETE 라우트가 존재하지 않는다', () => {
      // eslint-disable-next-line global-require
      const router = require('../../../src/modules/chat/message.routes');

      const disallowedMethods = router.stack
        .filter((layer) => layer.route)
        .flatMap((layer) => Object.keys(layer.route.methods));

      expect(disallowedMethods).not.toContain('put');
      expect(disallowedMethods).not.toContain('patch');
      expect(disallowedMethods).not.toContain('delete');
    });
  });

  describe('message.service — updateMessage/deleteMessage 미노출', () => {
    test('updateMessage/deleteMessage 함수가 export되지 않는다', () => {
      expect(messageService.updateMessage).toBeUndefined();
      expect(messageService.deleteMessage).toBeUndefined();
    });
  });
});

describe('getMessages — BE-17 채팅 일자별 이력 조회 및 폴링 (BR-06, BR-16)', () => {
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
    const leaderId = await createUser('팀장', `getmsg-leader-${suffix}@test.com`);
    createdUserIds.push(leaderId);
    const teamId = await createTeamWithLeader(`조회테스트팀-${suffix}`, leaderId);
    createdTeamIds.push(teamId);

    const memberIds = [];
    for (let i = 0; i < memberCount; i += 1) {
      const memberId = await createUser(`팀원${i}`, `getmsg-member${i}-${suffix}@test.com`);
      createdUserIds.push(memberId);
      await addMembership(teamId, memberId, 'member');
      memberIds.push(memberId);
    }

    return { leaderId, teamId, memberIds };
  }

  async function insertMessageAt(teamId, authorId, content, createdAtIso) {
    const result = await pool.query(
      `INSERT INTO messages (team_id, author_id, message_type, content, created_at)
         VALUES ($1, $2, 'general', $3, $4) RETURNING id`,
      [teamId, authorId, content, createdAtIso],
    );
    return result.rows[0].id;
  }

  test('일자별 조회 결과가 createdAt 오름차순으로 반환된다', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });

    await insertMessageAt(teamId, leaderId, '10분', '2026-07-14T00:10:00.000Z');
    await insertMessageAt(teamId, leaderId, '23시50분', '2026-07-14T23:50:00.000Z');
    await insertMessageAt(teamId, leaderId, '정오', '2026-07-14T12:00:00.000Z');

    const result = await messageService.getMessages(teamId, '2026-07-14');

    expect(result.map((m) => m.content)).toEqual(['10분', '정오', '23시50분']);
    const createdAts = result.map((m) => new Date(m.createdAt).getTime());
    expect(createdAts).toEqual([...createdAts].sort((a, b) => a - b));
  });

  test('날짜 경계(전날 23:59:59.999, 다음날 00:00:00.000)의 메시지는 결과에 포함되지 않는다', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });

    await insertMessageAt(teamId, leaderId, '전날끝', '2026-07-13T23:59:59.999Z');
    await insertMessageAt(teamId, leaderId, '다음날시작', '2026-07-15T00:00:00.000Z');
    await insertMessageAt(teamId, leaderId, '당일', '2026-07-14T12:00:00.000Z');

    const result = await messageService.getMessages(teamId, '2026-07-14');

    expect(result.map((m) => m.content)).toEqual(['당일']);
  });

  test('since로 폴링 시 strictly greater 기준으로 신규 메시지만 반환된다(정각 메시지는 제외)', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });

    await insertMessageAt(teamId, leaderId, '정각', '2026-07-14T10:00:00.000Z');
    await insertMessageAt(teamId, leaderId, '1초후', '2026-07-14T10:00:01.000Z');
    await insertMessageAt(teamId, leaderId, '11시', '2026-07-14T11:00:00.000Z');

    const result = await messageService.getMessages(teamId, '2026-07-14', '2026-07-14T10:00:00.000Z');

    expect(result.map((m) => m.content)).toEqual(['1초후', '11시']);
  });

  test('폴링 시나리오: 1차 응답의 마지막 createdAt을 since로 재조회하면 중복 없이 신규분만 온다', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });

    await insertMessageAt(teamId, leaderId, '첫번째', '2026-07-14T09:00:00.000Z');
    await insertMessageAt(teamId, leaderId, '두번째', '2026-07-14T09:30:00.000Z');

    const first = await messageService.getMessages(teamId, '2026-07-14');
    expect(first.map((m) => m.content)).toEqual(['첫번째', '두번째']);
    // createdAt은 DB에서 Date 객체로 반환될 수 있다. 실제 폴링 클라이언트는 JSON 응답(res.json())으로
    // 직렬화된 ISO 문자열을 그대로 다음 요청의 since로 재사용하므로, 그 왕복을 재현한다.
    const lastCreatedAt = new Date(first[first.length - 1].createdAt).toISOString();

    await insertMessageAt(teamId, leaderId, '세번째', '2026-07-14T10:00:00.000Z');

    const second = await messageService.getMessages(teamId, '2026-07-14', lastCreatedAt);

    expect(second.map((m) => m.content)).toEqual(['세번째']);
    expect(second.find((m) => m.content === '두번째')).toBeUndefined();
  });

  test('since가 date 범위보다 이전이면 date 전체가 반환된다', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });

    await insertMessageAt(teamId, leaderId, '당일메시지1', '2026-07-14T01:00:00.000Z');
    await insertMessageAt(teamId, leaderId, '당일메시지2', '2026-07-14T02:00:00.000Z');

    const result = await messageService.getMessages(teamId, '2026-07-14', '2026-07-13T00:00:00.000Z');

    expect(result.map((m) => m.content)).toEqual(['당일메시지1', '당일메시지2']);
  });

  test('since가 date 범위보다 이후면 빈 배열이 반환된다', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });

    await insertMessageAt(teamId, leaderId, '당일메시지', '2026-07-14T01:00:00.000Z');

    const result = await messageService.getMessages(teamId, '2026-07-14', '2026-07-15T00:00:00.000Z');

    expect(result).toEqual([]);
  });

  test('과거 날짜(2020-01-01) 조회도 동일하게 동작한다 (BR-06)', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });

    await insertMessageAt(teamId, leaderId, '오래된메시지', '2020-01-01T05:00:00.000Z');

    const result = await messageService.getMessages(teamId, '2020-01-01');

    expect(result.map((m) => m.content)).toEqual(['오래된메시지']);
  });

  test('date 오류: 누락/형식오류/존재하지 않는 날짜는 400이다', async () => {
    const { teamId } = await setupTeam({ memberCount: 0 });

    await expect(messageService.getMessages(teamId, undefined)).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(messageService.getMessages(teamId, '2026/07/14')).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(messageService.getMessages(teamId, '2026-02-30')).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  test('since 오류: 파싱 불가능한 문자열은 400, 미제공/빈 문자열은 date 전체를 반환한다', async () => {
    const { leaderId, teamId } = await setupTeam({ memberCount: 0 });

    await expect(
      messageService.getMessages(teamId, '2026-07-14', 'not-a-date'),
    ).rejects.toMatchObject({ statusCode: 400 });

    await insertMessageAt(teamId, leaderId, '메시지', '2026-07-14T01:00:00.000Z');

    const withoutSince = await messageService.getMessages(teamId, '2026-07-14', undefined);
    const withEmptySince = await messageService.getMessages(teamId, '2026-07-14', '');

    expect(withoutSince.map((m) => m.content)).toEqual(['메시지']);
    expect(withEmptySince.map((m) => m.content)).toEqual(['메시지']);
  });

  test('팀 격리: 다른 팀의 메시지는 결과에 포함되지 않는다 (BR-16)', async () => {
    const teamA = await setupTeam({ memberCount: 0 });
    const teamB = await setupTeam({ memberCount: 0 });

    await insertMessageAt(teamA.teamId, teamA.leaderId, 'A팀메시지', '2026-07-14T01:00:00.000Z');
    await insertMessageAt(teamB.teamId, teamB.leaderId, 'B팀메시지', '2026-07-14T01:00:00.000Z');

    const result = await messageService.getMessages(teamA.teamId, '2026-07-14');

    expect(result.map((m) => m.content)).toEqual(['A팀메시지']);
  });

  test('system 메시지도 조회 결과에 포함되며 authorId=null, messageType=system으로 반환된다', async () => {
    const { teamId } = await setupTeam({ memberCount: 0 });
    const client = await pool.connect();

    let created;
    try {
      await client.query('BEGIN');
      created = await messageService.createSystemMessage(client, teamId, '시스템 알림');
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const today = new Date(created.createdAt).toISOString().slice(0, 10);
    const result = await messageService.getMessages(teamId, today);

    const systemMessage = result.find((m) => m.id === created.id);
    expect(systemMessage).toBeDefined();
    expect(systemMessage.authorId).toBeNull();
    expect(systemMessage.messageType).toBe('system');
    expect(systemMessage.content).toBe('시스템 알림');
  });
});
