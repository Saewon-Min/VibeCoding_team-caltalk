const express = require('express');
const authMiddleware = require('../../middleware/auth.middleware');
const teamAccessMiddleware = require('../../middleware/team-access.middleware');
const messageService = require('./message.service');

const router = express.Router();

router.use(authMiddleware);

// BE-16 / BR-01 / BR-06 / SC-12: 팀 채팅 일반 메시지 작성.
// BR-06(메시지 불변성)에 따라 메시지 수정/삭제 라우트는 이 파일에 의도적으로 존재하지 않는다.
// GET /:teamId/messages(일자별 이력 조회, BE-17)는 이 이슈 범위 밖이며 이후 이 파일에 추가된다.
router.post('/:teamId/messages', teamAccessMiddleware, async (req, res, next) => {
  try {
    const message = await messageService.createMessage(
      req.teamMembership.teamId,
      req.user.id,
      req.body,
    );
    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
