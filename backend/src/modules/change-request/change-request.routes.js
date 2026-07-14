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

// BE-19 / BR-16: 팀 내 변경 요청 목록 조회
router.get(
  '/:teamId/change-requests',
  teamAccessMiddleware,
  async (req, res, next) => {
    try {
      const changeRequests = await changeRequestService.listChangeRequests(
        req.teamMembership.teamId,
        { scheduleId: req.query.scheduleId, status: req.query.status },
      );
      res.status(200).json(changeRequests);
    } catch (err) {
      next(err);
    }
  },
);

// BE-19 / BR-16: 변경 요청 단건 조회
router.get(
  '/:teamId/change-requests/:requestId',
  teamAccessMiddleware,
  async (req, res, next) => {
    try {
      const changeRequest = await changeRequestService.getChangeRequestById(
        req.teamMembership.teamId,
        Number(req.params.requestId),
      );
      res.status(200).json(changeRequest);
    } catch (err) {
      next(err);
    }
  },
);

// BE-20 / BR-05 / BR-11 / BR-13: 변경 요청 승인
router.patch(
  '/:teamId/change-requests/:requestId/approve',
  teamAccessMiddleware,
  async (req, res, next) => {
    try {
      const changeRequest = await changeRequestService.approveChangeRequest(
        req.teamMembership.role,
        req.teamMembership.teamId,
        Number(req.params.requestId),
        req.user.id,
      );
      res.status(200).json(changeRequest);
    } catch (err) {
      next(err);
    }
  },
);

// BE-21 / BR-05 / BR-13: 변경 요청 거절
router.patch(
  '/:teamId/change-requests/:requestId/reject',
  teamAccessMiddleware,
  async (req, res, next) => {
    try {
      const changeRequest = await changeRequestService.rejectChangeRequest(
        req.teamMembership.role,
        req.teamMembership.teamId,
        Number(req.params.requestId),
        req.user.id,
      );
      res.status(200).json(changeRequest);
    } catch (err) {
      next(err);
    }
  },
);

// BE-22 / BR-12 / SC-10: 변경 요청 취소 (요청자 본인만 가능)
router.patch(
  '/:teamId/change-requests/:requestId/cancel',
  teamAccessMiddleware,
  async (req, res, next) => {
    try {
      const changeRequest = await changeRequestService.cancelChangeRequest(
        req.teamMembership.teamId,
        Number(req.params.requestId),
        req.user.id,
      );
      res.status(200).json(changeRequest);
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
