async function createMessage(client, { teamId, authorId, messageType, content }) {
  const result = await client.query(
    `INSERT INTO messages (team_id, author_id, message_type, content)
     VALUES ($1, $2, $3, $4)
     RETURNING id, team_id AS "teamId", author_id AS "authorId",
               message_type AS "messageType", content, created_at AS "createdAt"`,
    [teamId, authorId, messageType, content],
  );
  return result.rows[0];
}

// BE-17 / BR-06 / BR-16: teamId + 일자 범위(+선택적 since)로 메시지를 created_at 오름차순 조회한다.
async function findMessagesByTeamAndDate(client, teamId, rangeStart, rangeEnd, since) {
  const params = [teamId, rangeStart, rangeEnd];
  let sinceClause = '';
  if (since) {
    params.push(since);
    sinceClause = ` AND created_at > $${params.length}`;
  }

  const result = await client.query(
    `SELECT id, team_id AS "teamId", author_id AS "authorId",
            message_type AS "messageType", content, created_at AS "createdAt"
       FROM messages
      WHERE team_id = $1
        AND created_at >= $2
        AND created_at < $3
        ${sinceClause}
      ORDER BY created_at ASC`,
    params,
  );
  return result.rows;
}

module.exports = { createMessage, findMessagesByTeamAndDate };
