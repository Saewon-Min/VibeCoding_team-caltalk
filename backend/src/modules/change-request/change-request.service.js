const { pool } = require('../../db/pool');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../../shared/errors');
const scheduleService = require('../team-schedule/schedule.service');
const messageService = require('../chat/message.service');
const changeRequestQueries = require('./change-request.queries');

// BE-18 / BR-04 / BR-10 / SC-06: 참여자가 자신이 지정된 일정에 대해 변경을 요청한다.
// ScheduleChangeRequest(status=pending)와 Message(messageType=change_request)를 한 트랜잭션으로 생성한다.
// BR-10은 역할(팀장/팀원) 무관, 참여자 여부만 판단한다 — 팀장이 자기 일정의 참여자로 지정돼 있어도 허용.
async function createChangeRequest(teamId, scheduleId, requesterId, body) {
  const schedule = await scheduleService.getScheduleById(scheduleId);
  if (!schedule || Number(schedule.teamId) !== Number(teamId)) {
    throw new NotFoundError('일정을 찾을 수 없습니다');
  }

  const isParticipant = await changeRequestQueries.existsParticipant(pool, scheduleId, requesterId);
  if (!isParticipant) {
    throw new ForbiddenError('해당 일정의 참여자만 변경을 요청할 수 있습니다');
  }

  const reason = body?.reason;
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new BadRequestError('reason은 비어 있지 않은 문자열이어야 합니다');
  }
  const { proposedTitle, proposedStartAt, proposedEndAt } = body || {};

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const message = await messageService.createChangeRequestMessage(client, teamId, requesterId, reason);
    const changeRequest = await changeRequestQueries.createChangeRequest(client, {
      scheduleId,
      messageId: message.id,
      requesterId,
      proposedTitle: proposedTitle ?? null,
      proposedStartAt: proposedStartAt ?? null,
      proposedEndAt: proposedEndAt ?? null,
      reason,
    });
    await client.query('COMMIT');
    return changeRequest;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { createChangeRequest };
