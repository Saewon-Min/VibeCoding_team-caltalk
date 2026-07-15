export function validateChangeRequestForm({ scheduleId, reason }) {
  const errors = {};

  if (!scheduleId) {
    errors.scheduleId = '대상 일정을 선택해주세요.';
  }

  if (!reason || reason.trim() === '') {
    errors.reason = '요청 사유를 입력해주세요.';
  }

  return errors;
}
