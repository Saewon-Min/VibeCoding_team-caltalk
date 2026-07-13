async function existsParticipant(client, scheduleId, userId) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM schedule_participants
        WHERE schedule_id = $1 AND user_id = $2
     ) AS "exists"`,
    [scheduleId, userId],
  );
  return result.rows[0].exists;
}

async function createChangeRequest(
  client,
  { scheduleId, messageId, requesterId, proposedTitle, proposedStartAt, proposedEndAt, reason },
) {
  const result = await client.query(
    `INSERT INTO schedule_change_requests
       (schedule_id, message_id, requester_id, proposed_title, proposed_start_at, proposed_end_at, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, schedule_id AS "scheduleId", message_id AS "messageId",
               requester_id AS "requesterId", proposed_title AS "proposedTitle",
               proposed_start_at AS "proposedStartAt", proposed_end_at AS "proposedEndAt",
               reason, status, processed_by AS "processedBy", processed_at AS "processedAt",
               created_at AS "createdAt"`,
    [scheduleId, messageId, requesterId, proposedTitle ?? null, proposedStartAt ?? null, proposedEndAt ?? null, reason],
  );
  return result.rows[0];
}

module.exports = { existsParticipant, createChangeRequest };
