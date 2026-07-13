const { pool } = require('../../db/pool');
const { ROLE } = require('../../shared/constants');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../../shared/errors');
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

// BE-13 / BR-02 / BR-03 / SC-05: 팀장만 일정 수정 가능. change-request 모듈(BE-20)이
// 승인 처리 트랜잭션 내부에서 재사용할 수 있도록 options.client로 외부 트랜잭션 client를
// 주입받을 수 있다. 주입되면 BEGIN/COMMIT/ROLLBACK/release는 호출자 책임이다.
async function updateScheduleFields(actorRole, teamId, scheduleId, patch, options = {}) {
  if (actorRole !== ROLE.LEADER) {
    throw new ForbiddenError('팀장만 일정을 수정할 수 있습니다');
  }

  const body = patch || {};
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

  const fields = {};
  if (has('title')) fields.title = body.title;
  if (has('description')) fields.description = body.description;
  if (has('startAt')) fields.startAt = body.startAt;
  if (has('endAt')) fields.endAt = body.endAt;

  const participantUserIds = has('participantUserIds')
    ? [...new Set(body.participantUserIds)]
    : null;

  const externalClient = options.client;
  const client = externalClient || (await pool.connect());
  const ownsTransaction = !externalClient;

  try {
    const schedule = await scheduleQueries.findScheduleById(client, scheduleId);
    // team_id는 bigint 컬럼이라 pg 드라이버가 문자열로 반환하므로, Number 변환 후 비교한다
    // (teamAccessMiddleware가 req.teamMembership.teamId를 Number로 세팅하는 것과 맞춤).
    if (!schedule || Number(schedule.teamId) !== Number(teamId)) {
      throw new NotFoundError('일정을 찾을 수 없습니다');
    }

    const nextStartAt = fields.startAt ?? schedule.startAt;
    const nextEndAt = fields.endAt ?? schedule.endAt;
    if (new Date(nextEndAt) <= new Date(nextStartAt)) {
      throw new BadRequestError('endAt은 startAt보다 이후여야 합니다');
    }

    if (participantUserIds && participantUserIds.length > 0) {
      const memberIds = await scheduleQueries.findTeamMemberIds(client, teamId, participantUserIds);
      if (memberIds.length !== participantUserIds.length) {
        throw new BadRequestError('참여자는 모두 팀 소속이어야 합니다');
      }
    }

    if (ownsTransaction) await client.query('BEGIN');

    let updated = schedule;
    if (Object.keys(fields).length > 0) {
      updated = await scheduleQueries.updateSchedule(client, scheduleId, fields);
    }
    if (participantUserIds !== null) {
      await scheduleQueries.replaceParticipants(client, scheduleId, participantUserIds);
    }

    if (ownsTransaction) await client.query('COMMIT');

    const finalIds = await scheduleQueries.getParticipantUserIds(client, scheduleId);
    const participants = finalIds.length > 0 ? await scheduleQueries.getUsersByIds(client, finalIds) : [];

    return { ...updated, participants };
  } catch (err) {
    if (ownsTransaction) await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    if (ownsTransaction) client.release();
  }
}

// BE-13 / BR-02 / BR-03 / SC-05: 팀장만 삭제 가능. schedule_participants는 cascade로 자동 삭제.
async function deleteSchedule(actorRole, teamId, scheduleId) {
  if (actorRole !== ROLE.LEADER) {
    throw new ForbiddenError('팀장만 일정을 삭제할 수 있습니다');
  }

  const client = await pool.connect();
  try {
    const schedule = await scheduleQueries.findScheduleById(client, scheduleId);
    if (!schedule || Number(schedule.teamId) !== Number(teamId)) {
      throw new NotFoundError('일정을 찾을 수 없습니다');
    }

    await client.query('BEGIN');
    await scheduleQueries.deleteSchedule(client, scheduleId);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

const VALID_VIEWS = ['month', 'week', 'day'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDateOnly(date) {
  if (typeof date !== 'string' || !DATE_PATTERN.test(date)) {
    throw new BadRequestError('date는 YYYY-MM-DD 형식이어야 합니다');
  }
  const [y, m, d] = date.split('-').map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d));
  if (anchor.getUTCFullYear() !== y || anchor.getUTCMonth() !== m - 1 || anchor.getUTCDate() !== d) {
    throw new BadRequestError('date가 유효한 날짜가 아닙니다');
  }
  return anchor;
}

// BE-14 / BR-03: view/date로 [rangeStart, rangeEnd) 반열린 구간(UTC)을 계산한다.
// UTC 자정을 기준으로 삼는다 — DB timestamptz 컬럼, 기존 테스트 픽스처가 모두 UTC('...Z')이며,
// 서버 프로세스의 TZ 환경변수에 결과가 흔들리지 않도록 하기 위함(known limitation: KST 사용자의
// "그 날/그 주" 인식과 최대 9시간 어긋날 수 있음 — 타임존 파라미터는 이 이슈 범위 밖).
function computeDateRange(view, date) {
  if (typeof view !== 'string' || !VALID_VIEWS.includes(view)) {
    throw new BadRequestError('view는 month, week, day 중 하나여야 합니다');
  }
  const anchor = parseDateOnly(date);

  if (view === 'day') {
    const rangeStart = anchor;
    const rangeEnd = new Date(anchor);
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
    return { rangeStart, rangeEnd };
  }

  if (view === 'week') {
    const dow = anchor.getUTCDay();
    const diffToMonday = dow === 0 ? 6 : dow - 1;
    const rangeStart = new Date(anchor);
    rangeStart.setUTCDate(rangeStart.getUTCDate() - diffToMonday);
    const rangeEnd = new Date(rangeStart);
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 7);
    return { rangeStart, rangeEnd };
  }

  const rangeStart = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
  const rangeEnd = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1));
  return { rangeStart, rangeEnd };
}

// BE-14 / BR-03 / BR-16: teamId/role은 teamAccessMiddleware가 검증한 값을 신뢰한다.
async function getSchedules(actorRole, teamId, view, date) {
  const { rangeStart, rangeEnd } = computeDateRange(view, date);
  const rows = await scheduleQueries.findSchedulesByRange(pool, teamId, rangeStart, rangeEnd);
  const canEdit = actorRole === ROLE.LEADER;
  return rows.map((row) => ({ ...row, canEdit }));
}

module.exports = {
  createSchedule,
  updateScheduleFields,
  deleteSchedule,
  getSchedules,
  computeDateRange,
};
