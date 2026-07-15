function cloneDate(date) {
  return new Date(date.getTime());
}

function startOfDay(date) {
  const clone = cloneDate(date);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

function addDays(date, n) {
  const clone = cloneDate(date);
  clone.setDate(clone.getDate() + n);
  return clone;
}

export function buildMonthGrid(referenceDate) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  // day 0 of next month === last day of this month, handles leap Februaries automatically
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingCount = firstOfMonth.getDay();
  const rawCount = leadingCount + daysInMonth;
  const totalCells = Math.ceil(rawCount / 7) * 7;
  const trailingCount = totalCells - rawCount;

  const cells = [];
  for (let i = 0; i < leadingCount; i += 1) {
    cells.push({ date: addDays(firstOfMonth, i - leadingCount), isCurrentMonth: false });
  }
  for (let i = 0; i < daysInMonth; i += 1) {
    cells.push({ date: addDays(firstOfMonth, i), isCurrentMonth: true });
  }
  for (let i = 0; i < trailingCount; i += 1) {
    cells.push({ date: addDays(firstOfMonth, daysInMonth + i), isCurrentMonth: false });
  }

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

export function buildWeekDays(referenceDate) {
  const dow = referenceDate.getDay();
  const diffToMonday = dow === 0 ? 6 : dow - 1;
  const monday = addDays(startOfDay(referenceDate), -diffToMonday);
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    days.push(addDays(monday, i));
  }
  return days;
}

export function buildDayTimeSlots(referenceDate) {
  const base = startOfDay(referenceDate);
  const slots = [];
  for (let hour = 0; hour < 24; hour += 1) {
    const clone = cloneDate(base);
    clone.setHours(hour);
    slots.push(clone);
  }
  return slots;
}

export function formatDateParam(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatTimeLabel(date) {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
