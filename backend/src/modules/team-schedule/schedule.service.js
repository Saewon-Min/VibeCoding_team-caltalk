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

module.exports = { createSchedule, getSchedules, computeDateRange };
