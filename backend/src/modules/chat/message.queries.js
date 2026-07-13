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

module.exports = { createMessage };
