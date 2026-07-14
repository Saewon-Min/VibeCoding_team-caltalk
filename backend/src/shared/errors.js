class AppError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

class BadRequestError extends AppError {
  constructor(message, code = 'BAD_REQUEST') {
    super(400, code, message);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = '인증이 필요합니다', code = 'UNAUTHORIZED') {
    super(401, code, message);
  }
}

class ForbiddenError extends AppError {
  constructor(message = '권한이 없습니다', code = 'FORBIDDEN') {
    super(403, code, message);
  }
}

class NotFoundError extends AppError {
  constructor(message = '요청한 리소스를 찾을 수 없습니다', code = 'NOT_FOUND') {
    super(404, code, message);
  }
}

class ConflictError extends AppError {
  constructor(message, code = 'CONFLICT') {
    super(409, code, message);
  }
}

module.exports = {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
};
