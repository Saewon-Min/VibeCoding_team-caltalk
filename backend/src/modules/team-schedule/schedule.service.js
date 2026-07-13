const { pool } = require('../../db/pool');
const { ROLE } = require('../../shared/constants');
const { BadRequestError, ForbiddenError } = require('../../shared/errors');
const scheduleQueries = require('./schedule.queries');

// BE-12 / BR-02 / BR-07 / SC-03: 팀장만 일정 생성 가능. teamId는 URL 기준 값만 사용(BR-07).
async function createSchedule(actorRole, teamId, creatorId, body) {
  if (actorRole !== ROLE.LEADER) {
    throw new ForbiddenError('팀장만 일정을 생성할 수 있습니다');
  }

  const { title, description, startAt, endAt } = body || {};
  const participantUserIds = [
    ...new Set(Array.isArray(body?.participantUserIds) ? body.participantUserIds : []),
  ];

  const client = await pool.connect();
  try {
    if (participantUserIds.length > 0) {
      const memberIds = await scheduleQueries.findTeamMemberIds(client, teamId, participantUserIds);
      if (memberIds.length !== participantUserIds.length) {
        throw new BadRequestError('참여자는 모두 팀 소속이어야 합니다');
      }
    }

    await client.query('BEGIN');
    const schedule = await scheduleQueries.createSchedule(client, {
      teamId,
      title,
      description,
      startAt,
      endAt,
      createdBy: creatorId,
    });
    await scheduleQueries.addParticipants(client, schedule.id, participantUserIds);
    await client.query('COMMIT');

    const participants =
      participantUserIds.length > 0
        ? await scheduleQueries.getUsersByIds(client, participantUserIds)
        : [];

    return { ...schedule, participants };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { createSchedule };
