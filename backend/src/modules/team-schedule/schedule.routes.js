const express = require('express');
const authMiddleware = require('../../middleware/auth.middleware');
const teamAccessMiddleware = require('../../middleware/team-access.middleware');
const scheduleService = require('./schedule.service');

const router = express.Router();

router.use(authMiddleware);

// BE-12: 팀 일정 생성 (BR-02, BR-07)
router.post('/:teamId/schedules', teamAccessMiddleware, async (req, res, next) => {
  try {
    const schedule = await scheduleService.createSchedule(
      req.teamMembership.role,
      req.teamMembership.teamId,
      req.user.id,
      req.body,
    );
    res.status(201).json(schedule);
  } catch (err) {
    next(err);
  }
});

// BE-14: 팀 일정 월/주/일 조회 (BR-03, BR-16)
router.get('/:teamId/schedules', teamAccessMiddleware, async (req, res, next) => {
  try {
    const { view, date } = req.query;
    const schedules = await scheduleService.getSchedules(
      req.teamMembership.role,
      req.teamMembership.teamId,
      view,
      date,
    );
    res.status(200).json(schedules);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
