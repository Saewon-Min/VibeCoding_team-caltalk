const { pool } = require('../../db/pool');

async function createTeamWithLeader(client, { name, creatorId }) {
  const teamResult = await client.query(
    `INSERT INTO teams (name, created_by) VALUES ($1, $2)
     RETURNING id, name, created_at, updated_at`,
    [name, creatorId],
  );
  const team = teamResult.rows[0];

  await client.query(
    `INSERT INTO team_memberships (team_id, user_id, role) VALUES ($1, $2, 'leader')`,
    [team.id, creatorId],
  );

  return team;
}

async function getMyTeams(userId) {
  const result = await pool.query(
    `SELECT t.id, t.name, t.created_at, t.updated_at, tm.role
       FROM team_memberships tm
       JOIN teams t ON t.id = tm.team_id
      WHERE tm.user_id = $1
      ORDER BY t.created_at`,
    [userId],
  );
  return result.rows;
}

async function findUserByEmail(email) {
  const result = await pool.query('SELECT id, name, email FROM users WHERE email = $1', [email]);
  return result.rows[0] || null;
}

async function findMembership(teamId, userId) {
  const result = await pool.query(
    'SELECT role FROM team_memberships WHERE team_id = $1 AND user_id = $2',
    [teamId, userId],
  );
  return result.rows[0] || null;
}

async function listMembers(teamId) {
  const result = await pool.query(
    `SELECT u.id AS "userId", u.name, u.email, tm.role, tm.joined_at AS "joinedAt"
       FROM team_memberships tm
       JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = $1
      ORDER BY tm.joined_at`,
    [teamId],
  );
  return result.rows;
}

async function addMember(teamId, userId, role = 'member') {
  const result = await pool.query(
    `INSERT INTO team_memberships (team_id, user_id, role) VALUES ($1, $2, $3)
     RETURNING user_id AS "userId", role, joined_at AS "joinedAt"`,
    [teamId, userId, role],
  );
  return result.rows[0];
}

async function countLeaders(client, teamId) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS count FROM team_memberships WHERE team_id = $1 AND role = 'leader'`,
    [teamId],
  );
  return result.rows[0].count;
}

async function updateMemberRole(client, teamId, userId, role) {
  const result = await client.query(
    `UPDATE team_memberships SET role = $3 WHERE team_id = $1 AND user_id = $2
     RETURNING user_id AS "userId", role, joined_at AS "joinedAt"`,
    [teamId, userId, role],
  );
  return result.rows[0] || null;
}

async function removeMember(client, teamId, userId) {
  const result = await client.query(
    'DELETE FROM team_memberships WHERE team_id = $1 AND user_id = $2',
    [teamId, userId],
  );
  return result.rowCount > 0;
}

async function getUserById(client, userId) {
  const result = await client.query('SELECT id, name, email FROM users WHERE id = $1', [userId]);
  return result.rows[0] || null;
}

module.exports = {
  createTeamWithLeader,
  getMyTeams,
  findUserByEmail,
  findMembership,
  listMembers,
  addMember,
  countLeaders,
  updateMemberRole,
  removeMember,
  getUserById,
};
