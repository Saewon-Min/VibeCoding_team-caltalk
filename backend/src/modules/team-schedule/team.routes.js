const express = require('express');
const authMiddleware = require('../../middleware/auth.middleware');
const teamAccessMiddleware = require('../../middleware/team-access.middleware');
const teamService = require('./team.service');

const router = express.Router();

router.use(authMiddleware);

// BE-08: 팀 생성 (BR-15)
router.post('/', async (req, res, next) => {
  try {
    const team = await teamService.createTeam(req.user.id, req.body?.name);
    res.status(201).json(team);
  } catch (err) {
    next(err);
  }
});

// BE-08(§1.2 편입): 내 소속 팀 목록
router.get('/', async (req, res, next) => {
  try {
    const teams = await teamService.getMyTeams(req.user.id);
    res.status(200).json(teams);
  } catch (err) {
    next(err);
  }
});

// BE-09: 이메일로 가입된 사용자 검색 (팀원 추가용)
router.get('/:teamId/members/search', teamAccessMiddleware, async (req, res, next) => {
  try {
    const user = await teamService.searchMemberByEmail(req.teamMembership.role, req.query.email);
    res.status(200).json(user);
  } catch (err) {
    next(err);
  }
});

// BE-09: 팀원 목록 조회
router.get('/:teamId/members', teamAccessMiddleware, async (req, res, next) => {
  try {
    const members = await teamService.listMembers(req.teamMembership.teamId);
    res.status(200).json(members);
  } catch (err) {
    next(err);
  }
});

// BE-09: 팀원 즉시 추가
router.post('/:teamId/members', teamAccessMiddleware, async (req, res, next) => {
  try {
    const member = await teamService.addMember(
      req.teamMembership.role,
      req.teamMembership.teamId,
      req.body?.userId,
    );
    res.status(201).json(member);
  } catch (err) {
    next(err);
  }
});

// BE-10: 팀원 역할 변경 (BR-09)
router.patch('/:teamId/members/:userId', teamAccessMiddleware, async (req, res, next) => {
  try {
    const member = await teamService.updateMemberRole(
      req.teamMembership.role,
      req.teamMembership.teamId,
      Number(req.params.userId),
      req.body?.role,
    );
    res.status(200).json(member);
  } catch (err) {
    next(err);
  }
});

// BE-10: 팀원 제외 (BR-09)
router.delete('/:teamId/members/:userId', teamAccessMiddleware, async (req, res, next) => {
  try {
    await teamService.removeMember(
      req.teamMembership.role,
      req.teamMembership.teamId,
      Number(req.params.userId),
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
