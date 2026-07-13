const jwt = require('jsonwebtoken');
const { UnauthorizedError } = require('../shared/errors');

// BR-01: 인증이 필요한 모든 Route의 최전방에서 토큰 유효성을 검증하고,
// 실패 시 팀/일정/채팅 데이터를 전혀 포함하지 않은 401을 반환한다(SC-01 E2).
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new UnauthorizedError('인증 토큰이 필요합니다'));
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email, name: payload.name };
    return next();
  } catch (err) {
    return next(new UnauthorizedError('인증 토큰이 유효하지 않습니다'));
  }
}

module.exports = authMiddleware;
