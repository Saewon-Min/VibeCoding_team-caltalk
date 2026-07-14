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

// BE-19 / BR-16: 팀 내 변경 요청 목록 조회 (일정/상태 필터)
async function findByTeam(pool, teamId, { scheduleId, status }) {
  const result = await pool.query(
    `SELECT scr.id, scr.schedule_id AS "scheduleId", scr.message_id AS "messageId",
            scr.requester_id AS "requesterId", scr.proposed_title AS "proposedTitle",
            scr.proposed_start_at AS "proposedStartAt", scr.proposed_end_at AS "proposedEndAt",
            scr.reason, scr.status, scr.processed_by AS "processedBy", scr.processed_at AS "processedAt",
            scr.created_at AS "createdAt"
       FROM schedule_change_requests scr
       JOIN schedules s ON s.id = scr.schedule_id
      WHERE s.team_id = $1
        AND ($2::bigint IS NULL OR scr.schedule_id = $2)
        AND ($3::text IS NULL OR scr.status = $3)
      ORDER BY scr.created_at ASC`,
    [teamId, scheduleId ?? null, status ?? null],
  );
  return result.rows;
}

// BE-19 / BR-16: 변경 요청 단건 조회 (팀 소속 검증을 위해 teamId 포함)
async function findById(pool, requestId) {
  const result = await pool.query(
    `SELECT scr.id, scr.schedule_id AS "scheduleId", scr.message_id AS "messageId",
            scr.requester_id AS "requesterId", scr.proposed_title AS "proposedTitle",
            scr.proposed_start_at AS "proposedStartAt", scr.proposed_end_at AS "proposedEndAt",
            scr.reason, scr.status, scr.processed_by AS "processedBy", scr.processed_at AS "processedAt",
            scr.created_at AS "createdAt", s.team_id AS "teamId"
       FROM schedule_change_requests scr
       JOIN schedules s ON s.id = scr.schedule_id
      WHERE scr.id = $1`,
    [requestId],
  );
  return result.rows[0] || null;
}

// BE-20: 승인 대상을 제외한, 동일 schedule_id의 나머지 pending 요청 id 목록 (BR-11)
async function findOtherPendingByScheduleId(client, scheduleId, excludeId) {
  const result = await client.query(
    `SELECT id FROM schedule_change_requests
      WHERE schedule_id = $1 AND status = 'pending' AND id <> $2`,
    [scheduleId, excludeId],
  );
  return result.rows;
}

// BE-20/21: 상태 전이 공용 (approve/reject 모두 사용)
async function updateStatus(client, id, { status, processedBy }) {
  const result = await client.query(
    `UPDATE schedule_change_requests
        SET status = $1, processed_by = $2, processed_at = now()
      WHERE id = $3
      RETURNING id, schedule_id AS "scheduleId", message_id AS "messageId",
                requester_id AS "requesterId", proposed_title AS "proposedTitle",
                proposed_start_at AS "proposedStartAt", proposed_end_at AS "proposedEndAt",
                reason, status, processed_by AS "processedBy", processed_at AS "processedAt",
                created_at AS "createdAt"`,
    [status, processedBy, id],
  );
  return result.rows[0];
}

module.exports = {
  existsParticipant,
  createChangeRequest,
  findByTeam,
  findById,
  findOtherPendingByScheduleId,
  updateStatus,
};
