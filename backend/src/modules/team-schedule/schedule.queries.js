async function createSchedule(client, { teamId, title, description, startAt, endAt, createdBy }) {
  const result = await client.query(
    `INSERT INTO schedules (team_id, title, description, start_at, end_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, team_id AS "teamId", title, description,
               start_at AS "startAt", end_at AS "endAt",
               created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"`,
    [teamId, title, description ?? null, startAt, endAt, createdBy],
  );
  return result.rows[0];
}

async function addParticipants(client, scheduleId, userIds) {
  if (userIds.length === 0) {
    return;
  }
  await client.query(
    `INSERT INTO schedule_participants (schedule_id, user_id)
     SELECT $1, unnest($2::bigint[])`,
    [scheduleId, userIds],
  );
}

async function findTeamMemberIds(client, teamId, userIds) {
  const result = await client.query(
    `SELECT user_id AS "userId" FROM team_memberships
      WHERE team_id = $1 AND user_id = ANY($2::bigint[])`,
    [teamId, userIds],
  );
  return result.rows.map((r) => r.userId);
}

async function getUsersByIds(client, userIds) {
  const result = await client.query(
    `SELECT id AS "userId", name, email FROM users
      WHERE id = ANY($1::bigint[])
      ORDER BY id`,
    [userIds],
  );
  return result.rows;
}

module.exports = { createSchedule, addParticipants, findTeamMemberIds, getUsersByIds };
