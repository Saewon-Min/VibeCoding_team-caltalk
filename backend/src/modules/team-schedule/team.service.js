const { pool } = require('../../db/pool');
const { ROLE } = require('../../shared/constants');
const {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} = require('../../shared/errors');
const teamQueries = require('./team.queries');

const MIN_LEADER_MESSAGE = '팀에는 최소 1명의 팀장이 있어야 합니다';

function toTeamWithRole(team) {
  return {
    id: team.id,
    name: team.name,
    createdAt: team.created_at,
    updatedAt: team.updated_at,
    role: team.role,
  };
}

// BE-08 / BR-15 / SC-02: 팀 생성과 동시에 생성자를 팀장으로 트랜잭션 내 등록
async function createTeam(userId, name) {
  if (!name || !name.trim()) {
    throw new BadRequestError('팀 이름은 필수입니다');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const team = await teamQueries.createTeamWithLeader(client, { name, creatorId: userId });
    await client.query('COMMIT');
    return toTeamWithRole({ ...team, role: ROLE.LEADER });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// BE-08(§1.2 편입): 내 소속 팀 목록 + 역할
async function getMyTeams(userId) {
  const teams = await teamQueries.getMyTeams(userId);
  return teams.map(toTeamWithRole);
}

// BE-09 / BR-14 / SC-02: 팀장만 이메일 정확 일치로 가입 사용자 검색
async function searchMemberByEmail(actorRole, email) {
  if (actorRole !== ROLE.LEADER) {
    throw new ForbiddenError('팀장만 팀원을 검색할 수 있습니다');
  }
  if (!email) {
    throw new BadRequestError('검색할 이메일이 필요합니다');
  }

  const user = await teamQueries.findUserByEmail(email);
  if (!user) {
    throw new NotFoundError('가입된 사용자를 찾을 수 없습니다');
  }
  return user;
}

async function listMembers(teamId) {
  return teamQueries.listMembers(teamId);
}

// BE-09 / BR-14 / SC-02: 팀장만 이메일 검색 결과(userId)로 즉시 추가
async function addMember(actorRole, teamId, targetUserId) {
  if (actorRole !== ROLE.LEADER) {
    throw new ForbiddenError('팀장만 팀원을 추가할 수 있습니다');
  }
  if (!targetUserId) {
    throw new BadRequestError('추가할 사용자의 userId가 필요합니다');
  }

  const client = await pool.connect();
  try {
    const user = await teamQueries.getUserById(client, targetUserId);
    if (!user) {
      throw new BadRequestError('존재하지 않는 사용자입니다');
    }

    const existing = await teamQueries.findMembership(teamId, targetUserId);
    if (existing) {
      throw new ConflictError('이미 팀에 소속된 사용자입니다');
    }

    try {
      return await teamQueries.addMember(teamId, targetUserId, ROLE.MEMBER);
    } catch (err) {
      if (err.code === '23505') {
        throw new ConflictError('이미 팀에 소속된 사용자입니다');
      }
      throw err;
    }
  } finally {
    client.release();
  }
}

// BE-10 / BR-09 / SC-11: 역할 변경 후 팀장이 0명이 되면 트랜잭션 롤백 + 409
async function updateMemberRole(actorRole, teamId, targetUserId, role) {
  if (actorRole !== ROLE.LEADER) {
    throw new ForbiddenError('팀장만 팀원의 역할을 변경할 수 있습니다');
  }
  if (![ROLE.LEADER, ROLE.MEMBER].includes(role)) {
    throw new BadRequestError('role은 leader 또는 member여야 합니다');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await teamQueries.findMembership(teamId, targetUserId);
    if (!existing) {
      await client.query('ROLLBACK');
      throw new NotFoundError('팀에 소속되지 않은 사용자입니다');
    }

    const updated = await teamQueries.updateMemberRole(client, teamId, targetUserId, role);

    const leaderCount = await teamQueries.countLeaders(client, teamId);
    if (leaderCount === 0) {
      await client.query('ROLLBACK');
      throw new ConflictError(MIN_LEADER_MESSAGE);
    }

    await client.query('COMMIT');
    return updated;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// BE-10 / BR-09 / SC-11: 제외 후 팀장이 0명이 되면 트랜잭션 롤백 + 409
async function removeMember(actorRole, teamId, targetUserId) {
  if (actorRole !== ROLE.LEADER) {
    throw new ForbiddenError('팀장만 팀원을 제외할 수 있습니다');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await teamQueries.findMembership(teamId, targetUserId);
    if (!existing) {
      await client.query('ROLLBACK');
      throw new NotFoundError('팀에 소속되지 않은 사용자입니다');
    }

    await teamQueries.removeMember(client, teamId, targetUserId);

    const leaderCount = await teamQueries.countLeaders(client, teamId);
    if (leaderCount === 0) {
      await client.query('ROLLBACK');
      throw new ConflictError(MIN_LEADER_MESSAGE);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  createTeam,
  getMyTeams,
  searchMemberByEmail,
  listMembers,
  addMember,
  updateMemberRole,
  removeMember,
};
