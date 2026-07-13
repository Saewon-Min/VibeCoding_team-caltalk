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

async function findScheduleById(client, scheduleId) {
  const result = await client.query(
    `SELECT id, team_id AS "teamId", title, description,
            start_at AS "startAt", end_at AS "endAt",
            created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM schedules WHERE id = $1`,
    [scheduleId],
  );
  return result.rows[0] || null;
}

async function updateSchedule(client, scheduleId, fields) {
  const setClauses = [];
  const values = [];
  let i = 1;

  if (Object.prototype.hasOwnProperty.call(fields, 'title')) {
    setClauses.push(`title = $${i++}`);
    values.push(fields.title);
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'description')) {
    setClauses.push(`description = $${i++}`);
    values.push(fields.description ?? null);
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'startAt')) {
    setClauses.push(`start_at = $${i++}`);
    values.push(fields.startAt);
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'endAt')) {
    setClauses.push(`end_at = $${i++}`);
    values.push(fields.endAt);
  }
  setClauses.push('updated_at = now()');
  values.push(scheduleId);

  const result = await client.query(
    `UPDATE schedules SET ${setClauses.join(', ')}
       WHERE id = $${i}
     RETURNING id, team_id AS "teamId", title, description,
               start_at AS "startAt", end_at AS "endAt",
               created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"`,
    values,
  );
  return result.rows[0];
}

async function deleteSchedule(client, scheduleId) {
  await client.query('DELETE FROM schedules WHERE id = $1', [scheduleId]);
}

async function replaceParticipants(client, scheduleId, userIds) {
  await client.query('DELETE FROM schedule_participants WHERE schedule_id = $1', [scheduleId]);
  await addParticipants(client, scheduleId, userIds);
}

async function getParticipantUserIds(client, scheduleId) {
  const result = await client.query(
    `SELECT user_id AS "userId" FROM schedule_participants WHERE schedule_id = $1 ORDER BY user_id`,
    [scheduleId],
  );
  return result.rows.map((r) => r.userId);
}

async function findSchedulesByRange(client, teamId, rangeStart, rangeEnd) {
  const result = await client.query(
    `SELECT id, team_id AS "teamId", title, description,
            start_at AS "startAt", end_at AS "endAt",
            created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM schedules
      WHERE team_id = $1
        AND start_at < $3
        AND end_at > $2
      ORDER BY start_at ASC`,
    [teamId, rangeStart, rangeEnd],
  );
  return result.rows;
}

module.exports = {
  createSchedule,
  addParticipants,
  findTeamMemberIds,
  getUsersByIds,
  findScheduleById,
  updateSchedule,
  deleteSchedule,
  replaceParticipants,
  getParticipantUserIds,
  findSchedulesByRange,
};
