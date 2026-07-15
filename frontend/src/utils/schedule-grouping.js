import { formatDateParam } from './calendar-date';

export function groupByLocalDate(items, getDate) {
  const map = new Map();
  const sorted = [...items].sort((a, b) => getDate(a) - getDate(b));
  sorted.forEach((item) => {
    const key = formatDateParam(getDate(item));
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  return map;
}
