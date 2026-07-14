const { pool } = require('../../db/pool');
const {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} = require('../../shared/errors');
const { ROLE, CHANGE_REQUEST_STATUS } = require('../../shared/constants');
const scheduleService = require('../team-schedule/schedule.service');
const messageService = require('../chat/message.service');
const changeRequestQueries = require('./change-request.queries');

const VALID_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];

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

// BE-19 / BR-16: 팀 내 변경 요청 목록 조회 (일정/상태 필터)
async function listChangeRequests(teamId, { scheduleId, status } = {}) {
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    throw new BadRequestError('status는 pending, approved, rejected, cancelled 중 하나여야 합니다');
  }
  if (scheduleId !== undefined && Number.isNaN(Number(scheduleId))) {
    throw new BadRequestError('scheduleId는 숫자여야 합니다');
  }

  return changeRequestQueries.findByTeam(pool, teamId, {
    scheduleId: scheduleId !== undefined ? Number(scheduleId) : null,
    status: status ?? null,
  });
}

// BE-19 / BR-16: 변경 요청 단건 조회
async function getChangeRequestById(teamId, requestId) {
  const row = await changeRequestQueries.findById(pool, requestId);
  if (!row) {
    throw new NotFoundError('변경 요청을 찾을 수 없습니다');
  }
  if (Number(row.teamId) !== Number(teamId)) {
    throw new NotFoundError('변경 요청을 찾을 수 없습니다');
  }

  const { teamId: _teamId, ...changeRequest } = row;
  return changeRequest;
}

// BE-20 / BR-05 / BR-11 / BR-13 / SC-07 / SC-09: 팀장이 변경 요청을 승인한다.
// 승인 시 일정에 제안 내용을 반영하고, 시스템 메시지를 남기며,
// 동일 일정의 나머지 대기 중인 요청은 모두 자동 거절 처리한다(BR-11).
async function approveChangeRequest(actorRole, teamId, requestId, approverId) {
  if (actorRole !== ROLE.LEADER) {
    throw new ForbiddenError('요청 승인 권한이 없습니다');
  }

  const target = await changeRequestQueries.findById(pool, requestId);
  if (!target || Number(target.teamId) !== Number(teamId)) {
    throw new NotFoundError('변경 요청을 찾을 수 없습니다');
  }
  if (target.status !== CHANGE_REQUEST_STATUS.PENDING) {
    throw new ConflictError('이미 처리된 요청입니다');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const approvedChangeRequest = await changeRequestQueries.updateStatus(client, requestId, {
      status: CHANGE_REQUEST_STATUS.APPROVED,
      processedBy: approverId,
    });

    const patch = {};
    if (target.proposedTitle !== null) patch.title = target.proposedTitle;
    if (target.proposedStartAt !== null) patch.startAt = target.proposedStartAt;
    if (target.proposedEndAt !== null) patch.endAt = target.proposedEndAt;
    if (Object.keys(patch).length > 0) {
      await scheduleService.updateScheduleFields(ROLE.LEADER, teamId, target.scheduleId, patch, {
        client,
      });
    }

    await messageService.createSystemMessage(
      client,
      teamId,
      `변경 요청이 승인되었습니다: ${target.reason}`,
    );

    const otherPending = await changeRequestQueries.findOtherPendingByScheduleId(
      client,
      target.scheduleId,
      requestId,
    );
    for (const other of otherPending) {
      await changeRequestQueries.updateStatus(client, other.id, {
        status: CHANGE_REQUEST_STATUS.REJECTED,
        processedBy: approverId,
      });
      await messageService.createSystemMessage(
        client,
        teamId,
        '동일 일정에 대한 다른 변경 요청이 자동으로 거절되었습니다.',
      );
    }

    await client.query('COMMIT');
    return approvedChangeRequest;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// BE-21 / BR-05 / BR-13 / SC-08: 팀장이 변경 요청을 거절한다.
// Schedule은 변경하지 않고 상태만 rejected로 전환하며, 처리 결과를 시스템 메시지로 남긴다.
async function rejectChangeRequest(actorRole, teamId, requestId, rejecterId) {
  if (actorRole !== ROLE.LEADER) {
    throw new ForbiddenError('요청 거절 권한이 없습니다');
  }

  const target = await changeRequestQueries.findById(pool, requestId);
  if (!target || Number(target.teamId) !== Number(teamId)) {
    throw new NotFoundError('변경 요청을 찾을 수 없습니다');
  }
  if (target.status !== CHANGE_REQUEST_STATUS.PENDING) {
    throw new ConflictError('이미 처리된 요청입니다');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const rejectedChangeRequest = await changeRequestQueries.updateStatus(client, requestId, {
      status: CHANGE_REQUEST_STATUS.REJECTED,
      processedBy: rejecterId,
    });

    await messageService.createSystemMessage(
      client,
      teamId,
      `변경 요청이 거절되었습니다: ${target.reason}`,
    );

    await client.query('COMMIT');
    return rejectedChangeRequest;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  createChangeRequest,
  listChangeRequests,
  getChangeRequestById,
  approveChangeRequest,
  rejectChangeRequest,
};
