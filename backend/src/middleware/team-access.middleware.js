const { pool } = require('../db/pool');
const { ForbiddenError } = require('../shared/errors');

// BR-16: `:teamId`를 포함한 모든 Route에서 요청자의 TeamMembership 존재 여부를
// 매 요청마다 서버 측에서 검증한다. 소속 사용자는 req.teamMembership(역할 포함)을 받는다.
async function teamAccessMiddleware(req, res, next) {
  const teamId = Number(req.params.teamId);

  try {
    const result = await pool.query(
      'SELECT role FROM team_memberships WHERE team_id = $1 AND user_id = $2',
      [teamId, req.user.id],
    );

    if (result.rowCount === 0) {
      return next(new ForbiddenError('소속되지 않은 팀입니다'));
    }

    req.teamMembership = { teamId, role: result.rows[0].role };
    return next();
  } catch (err) {
    return next(err);
  }
}

// teamId가 URL에 없는 리소스(예: scheduleId)의 팀 소속 여부를 검증하는 헬퍼.
// Day 2 이후 schedule 관련 라우트에서 사용한다.
async function requireScheduleTeamAccess(scheduleId, userId) {
  const result = await pool.query(
    `SELECT tm.role, s.team_id
       FROM schedules s
       JOIN team_memberships tm ON tm.team_id = s.team_id AND tm.user_id = $2
      WHERE s.id = $1`,
    [scheduleId, userId],
  );

  if (result.rowCount === 0) {
    throw new ForbiddenError('소속되지 않은 팀의 일정입니다');
  }

  return { teamId: result.rows[0].team_id, role: result.rows[0].role };
}

module.exports = teamAccessMiddleware;
module.exports.requireScheduleTeamAccess = requireScheduleTeamAccess;
