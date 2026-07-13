const express = require('express');
const authMiddleware = require('../../middleware/auth.middleware');
const teamAccessMiddleware = require('../../middleware/team-access.middleware');
const changeRequestService = require('./change-request.service');

const router = express.Router();

router.use(authMiddleware);

// BE-18 / BR-04 / BR-10 / SC-06: 일정 변경 요청 제기
router.post(
  '/:teamId/schedules/:scheduleId/change-requests',
  teamAccessMiddleware,
  async (req, res, next) => {
    try {
      const changeRequest = await changeRequestService.createChangeRequest(
        req.teamMembership.teamId,
        Number(req.params.scheduleId),
        req.user.id,
        req.body,
      );
      res.status(201).json(changeRequest);
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
