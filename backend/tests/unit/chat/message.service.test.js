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
    await pool.end();
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
