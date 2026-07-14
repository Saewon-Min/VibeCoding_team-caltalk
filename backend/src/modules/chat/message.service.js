const { pool } = require('../../db/pool');
const { MESSAGE_TYPE } = require('../../shared/constants');
const { BadRequestError } = require('../../shared/errors');
const messageQueries = require('./message.queries');

// BE-16 / BR-01 / SC-12: 팀 소속이면 역할(팀장/팀원) 구분 없이 누구나 일반 메시지를 작성할 수 있다.
// teamId/authorId는 teamAccessMiddleware/authMiddleware가 검증한 값을 신뢰한다(BR-16).
async function createMessage(teamId, authorId, body) {
  const content = body?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new BadRequestError('content는 비어 있지 않은 문자열이어야 합니다');
  }

  return messageQueries.createMessage(pool, {
    teamId,
    authorId,
    messageType: MESSAGE_TYPE.GENERAL,
    content,
  });
}

// Day4 BE-20/21/22(change-request 모듈)이 일정 변경 승인/반려 등과 같은 트랜잭션 안에서
// 시스템 메시지를 함께 커밋하기 위해 사용하는 공개 함수. 모듈 간 Query 계층 직접 참조 금지
// 원칙에 따라, change-request 모듈은 message.queries.js를 직접 호출하지 않고 반드시 이 함수를
// 통해야 한다. 시스템 메시지는 항상 호출자의 트랜잭션과 원자적으로 커밋되어야 하므로
// (독자적 단독 호출 시나리오가 없음) client를 선택 옵션이 아닌 필수 인자로 받는다.
async function createSystemMessage(client, teamId, content) {
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new BadRequestError('content는 비어 있지 않은 문자열이어야 합니다');
  }

  return messageQueries.createMessage(client, {
    teamId,
    authorId: null,
    messageType: MESSAGE_TYPE.SYSTEM,
    content,
  });
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// BE-17: chat 모듈 전용 최소 날짜 검증. team-schedule의 parseDateOnly/computeDateRange를
// 의도적으로 import하지 않는다 — 도메인이 무관한 두 모듈을 결합시키지 않기 위함이며,
// chat은 view 구분 없이 "day" 범위 하나만 필요해 로직도 더 단순하다.
function computeDayRange(date) {
  if (typeof date !== 'string' || !DATE_PATTERN.test(date)) {
    throw new BadRequestError('date는 YYYY-MM-DD 형식이어야 합니다');
  }
  const [y, m, d] = date.split('-').map(Number);
  const rangeStart = new Date(Date.UTC(y, m - 1, d));
  if (
    rangeStart.getUTCFullYear() !== y ||
    rangeStart.getUTCMonth() !== m - 1 ||
    rangeStart.getUTCDate() !== d
  ) {
    throw new BadRequestError('date가 유효한 날짜가 아닙니다');
  }
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
  return { rangeStart, rangeEnd };
}

// BE-17: since는 선택 값. 없으면 null을 반환해 쿼리 계층에서 필터를 생략하게 한다.
function parseSince(since) {
  if (since === undefined || since === null || since === '') {
    return null;
  }
  if (typeof since !== 'string') {
    throw new BadRequestError('since는 ISO 8601 날짜/시각 문자열이어야 합니다');
  }
  const parsed = new Date(since);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestError('since가 유효한 날짜/시각이 아닙니다');
  }
  return parsed;
}

// BE-17 / BR-06 / BR-16 / SC-12: date(필수) 하루 범위 내 메시지를 created_at 오름차순 반환.
// since(선택)가 있으면 그 범위 안에서 created_at > since로 추가 필터링한다(폴링용, strictly greater).
// teamId는 teamAccessMiddleware가 검증한 값을 신뢰한다(BR-16). 과거 일자 조회도 동일 로직으로
// 전체 이력을 반환한다(BR-06).
async function getMessages(teamId, date, since) {
  const { rangeStart, rangeEnd } = computeDayRange(date);
  const sinceDate = parseSince(since);
  return messageQueries.findMessagesByTeamAndDate(pool, teamId, rangeStart, rangeEnd, sinceDate);
}

// BE-18: change-request 모듈이 변경 요청 제기 트랜잭션 안에서 message_type=change_request
// 메시지를 함께 커밋하기 위해 사용하는 공개 함수. createSystemMessage와 동일하게, 요청 생성과
// 메시지 생성이 항상 한 트랜잭션이어야 하므로 client를 필수 인자로 받는다. content는 호출자가
// 넘긴 reason 문자열을 그대로 저장한다(SC-06 — 사용자가 입력한 내용 자체가 곧 reason).
async function createChangeRequestMessage(client, teamId, authorId, content) {
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new BadRequestError('content는 비어 있지 않은 문자열이어야 합니다');
  }

  return messageQueries.createMessage(client, {
    teamId,
    authorId,
    messageType: MESSAGE_TYPE.CHANGE_REQUEST,
    content,
  });
}

module.exports = { createMessage, createSystemMessage, getMessages, createChangeRequestMessage };
