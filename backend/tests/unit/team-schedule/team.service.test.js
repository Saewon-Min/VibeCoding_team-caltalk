require('dotenv').config();

const { pool } = require('../../../src/db/pool');
const teamService = require('../../../src/modules/team-schedule/team.service');

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
  await pool.query('DELETE FROM team_memberships WHERE team_id = $1', [teamId]);
  await pool.query('DELETE FROM teams WHERE id = $1', [teamId]);
}

describe('team.service — BR-09 팀장 최소 1인 유지', () => {
  const createdUserIds = [];

  afterAll(async () => {
    for (const id of createdUserIds) {
      await pool.query('DELETE FROM users WHERE id = $1', [id]);
    }
    await pool.end();
  });

  test('팀장이 1명뿐인 팀에서 그 팀장을 팀원으로 변경하면 실패한다', async () => {
    const leaderId = await createUser('단독팀장', `solo-leader-${Date.now()}@test.com`);
    createdUserIds.push(leaderId);
    const teamId = await createTeamWithLeader('단독팀장팀', leaderId);

    await expect(
      teamService.updateMemberRole('leader', teamId, leaderId, 'member'),
    ).rejects.toMatchObject({ statusCode: 409 });

    const role = await pool.query(
      'SELECT role FROM team_memberships WHERE team_id = $1 AND user_id = $2',
      [teamId, leaderId],
    );
    expect(role.rows[0].role).toBe('leader');

    await cleanupTeam(teamId);
  });

  test('팀장이 1명뿐인 팀에서 그 팀장을 제외하면 실패한다', async () => {
    const leaderId = await createUser('단독팀장2', `solo-leader2-${Date.now()}@test.com`);
    createdUserIds.push(leaderId);
    const teamId = await createTeamWithLeader('단독팀장팀2', leaderId);

    await expect(teamService.removeMember('leader', teamId, leaderId)).rejects.toMatchObject({
      statusCode: 409,
    });

    const row = await pool.query(
      'SELECT 1 FROM team_memberships WHERE team_id = $1 AND user_id = $2',
      [teamId, leaderId],
    );
    expect(row.rowCount).toBe(1);

    await cleanupTeam(teamId);
  });

  test('팀장이 2명 이상이면 한 명을 팀원으로 변경할 수 있다', async () => {
    const leaderId = await createUser('팀장A', `leaderA-${Date.now()}@test.com`);
    const leaderId2 = await createUser('팀장B', `leaderB-${Date.now()}@test.com`);
    createdUserIds.push(leaderId, leaderId2);
    const teamId = await createTeamWithLeader('복수팀장팀', leaderId);
    await addMembership(teamId, leaderId2, 'leader');

    const updated = await teamService.updateMemberRole('leader', teamId, leaderId2, 'member');
    expect(updated.role).toBe('member');

    await cleanupTeam(teamId);
  });

  test('팀장이 2명 이상이면 한 명을 제외할 수 있다', async () => {
    const leaderId = await createUser('팀장C', `leaderC-${Date.now()}@test.com`);
    const leaderId2 = await createUser('팀장D', `leaderD-${Date.now()}@test.com`);
    createdUserIds.push(leaderId, leaderId2);
    const teamId = await createTeamWithLeader('복수팀장팀2', leaderId);
    await addMembership(teamId, leaderId2, 'leader');

    await teamService.removeMember('leader', teamId, leaderId2);

    const row = await pool.query(
      'SELECT 1 FROM team_memberships WHERE team_id = $1 AND user_id = $2',
      [teamId, leaderId2],
    );
    expect(row.rowCount).toBe(0);

    await cleanupTeam(teamId);
  });
});
