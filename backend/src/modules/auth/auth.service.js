const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { BadRequestError, UnauthorizedError, ConflictError } = require('../../shared/errors');
const authQueries = require('./auth.queries');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toUserResponse(user) {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.created_at };
}

// BE-06 / BR-01 / SC-01
async function signup({ name, email, password }) {
  if (!name || !email || !password) {
    throw new BadRequestError('이름, 이메일, 비밀번호는 필수입니다');
  }
  if (!EMAIL_RE.test(email)) {
    throw new BadRequestError('이메일 형식이 올바르지 않습니다');
  }
  if (password.length < 8) {
    throw new BadRequestError('비밀번호는 8자 이상이어야 합니다');
  }

  const existing = await authQueries.findByEmail(email);
  if (existing) {
    throw new ConflictError('이미 가입된 이메일입니다');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await authQueries.createUser({ name, email, passwordHash });
  return toUserResponse(user);
}

// BE-07 / BR-01 / SC-01(E1) — 잘못된 비밀번호/미존재 이메일 모두 동일하게 401
async function login({ email, password }) {
  const user = await authQueries.findByEmail(email);
  if (!user) {
    throw new UnauthorizedError('이메일 또는 비밀번호가 일치하지 않습니다');
  }

  const matches = await bcrypt.compare(password || '', user.password_hash);
  if (!matches) {
    throw new UnauthorizedError('이메일 또는 비밀번호가 일치하지 않습니다');
  }

  const token = jwt.sign(
    { sub: user.id, email: user.email, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '12h' },
  );

  return {
    token,
    user: { id: user.id, name: user.name, email: user.email },
  };
}

module.exports = { signup, login };
