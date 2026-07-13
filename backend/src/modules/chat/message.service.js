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

module.exports = { createMessage, createSystemMessage };
