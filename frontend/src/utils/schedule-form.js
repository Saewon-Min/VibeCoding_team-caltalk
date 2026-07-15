export function toDateTimeLocalValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function validateScheduleForm({ title, startAt, endAt }) {
  const errors = {};

  if (!title || title.trim() === '') {
    errors.title = '제목을 입력해주세요.';
  }

  if (!startAt) {
    errors.startAt = '시작 일시를 입력해주세요.';
  }

  if (!endAt) {
    errors.endAt = '종료 일시를 입력해주세요.';
  }

  if (startAt && endAt && endAt <= startAt) {
    errors.endAt = '종료 일시는 시작 일시보다 이후여야 합니다.';
  }

  return errors;
}
