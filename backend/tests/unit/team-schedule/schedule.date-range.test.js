const { computeDateRange } = require('../../../src/modules/team-schedule/schedule.service');

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

describe('schedule.service — computeDateRange (BE-14 순수 함수 단위 테스트)', () => {
  test("day: '2026-07-14'는 해당 날짜 00:00:00.000Z ~ 다음날 00:00:00.000Z 범위를 반환한다", () => {
    const { rangeStart, rangeEnd } = computeDateRange('day', '2026-07-14');

    expect(rangeStart.toISOString()).toBe('2026-07-14T00:00:00.000Z');
    expect(rangeEnd.toISOString()).toBe('2026-07-15T00:00:00.000Z');
  });

  test("week: '2026-07-15'(수요일)는 월요일 시작 주 범위(07-13 ~ 07-20)를 반환한다", () => {
    const { rangeStart, rangeEnd } = computeDateRange('week', '2026-07-15');

    expect(rangeStart.toISOString()).toBe('2026-07-13T00:00:00.000Z');
    expect(rangeEnd.toISOString()).toBe('2026-07-20T00:00:00.000Z');
  });

  test("week: '2026-07-13'(월요일 자신)은 동일한 주 범위를 반환한다", () => {
    const { rangeStart, rangeEnd } = computeDateRange('week', '2026-07-13');

    expect(rangeStart.toISOString()).toBe('2026-07-13T00:00:00.000Z');
    expect(rangeEnd.toISOString()).toBe('2026-07-20T00:00:00.000Z');
  });

  test("week: '2026-07-19'(일요일)은 같은 주(07-13 ~ 07-20) 범위를 반환한다", () => {
    const { rangeStart, rangeEnd } = computeDateRange('week', '2026-07-19');

    expect(rangeStart.toISOString()).toBe('2026-07-13T00:00:00.000Z');
    expect(rangeEnd.toISOString()).toBe('2026-07-20T00:00:00.000Z');
  });

  test("month: '2026-07-31'은 07-01 ~ 08-01 범위를 반환한다", () => {
    const { rangeStart, rangeEnd } = computeDateRange('month', '2026-07-31');

    expect(rangeStart.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(rangeEnd.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  test("month: '2026-12-15'는 12-01 ~ 다음 연도 01-01(연도 롤오버) 범위를 반환한다", () => {
    const { rangeStart, rangeEnd } = computeDateRange('month', '2026-12-15');

    expect(rangeStart.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(rangeEnd.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  test("week: '2026-01-01'(목요일, 연초)은 전년도로 롤오버되는 주 범위(2025-12-29 ~ 2026-01-05)를 반환한다", () => {
    const { rangeStart, rangeEnd } = computeDateRange('week', '2026-01-01');

    expect(rangeStart.toISOString()).toBe('2025-12-29T00:00:00.000Z');
    expect(rangeEnd.toISOString()).toBe('2026-01-05T00:00:00.000Z');
  });

  test('day 범위는 정확히 86400000ms(하루) 차이다', () => {
    const { rangeStart, rangeEnd } = computeDateRange('day', '2026-07-14');

    expect(rangeEnd.getTime() - rangeStart.getTime()).toBe(DAY_MS);
  });

  test('week 범위는 정확히 7*86400000ms(7일) 차이다', () => {
    const { rangeStart, rangeEnd } = computeDateRange('week', '2026-07-15');

    expect(rangeEnd.getTime() - rangeStart.getTime()).toBe(WEEK_MS);
  });

  test("view='invalid'면 statusCode 400 에러를 throw한다", () => {
    expect(() => computeDateRange('invalid', '2026-07-14')).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
  });

  test("date='2026-02-30'(존재하지 않는 날짜)이면 statusCode 400 에러를 throw한다", () => {
    expect(() => computeDateRange('day', '2026-02-30')).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
  });

  test("date='not-a-date'(형식 오류)이면 statusCode 400 에러를 throw한다", () => {
    expect(() => computeDateRange('day', 'not-a-date')).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
  });
});
