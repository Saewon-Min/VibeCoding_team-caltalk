import { describe, it, expect } from 'vitest'
import {
  buildMonthGrid,
  buildWeekDays,
  buildDayTimeSlots,
  formatDateParam,
  formatTimeLabel,
  addDays,
  addWeeks,
  addMonths,
  formatMonthLabel,
  formatWeekRangeLabel,
  formatDayViewLabel,
} from './calendar-date.js'

describe('buildMonthGrid', () => {
  it('day 1이 일요일인 달은 첫 행 첫 칸이 1일이고 선행 빈 칸이 없다 (2026-02)', () => {
    // 2026-02-01은 일요일 (leadingCount = 0)
    const grid = buildMonthGrid(new Date(2026, 1, 1))
    const firstCell = grid[0][0]

    expect(firstCell.isCurrentMonth).toBe(true)
    expect(firstCell.date.getFullYear()).toBe(2026)
    expect(firstCell.date.getMonth()).toBe(1)
    expect(firstCell.date.getDate()).toBe(1)
  })

  it('행 개수가 6행이 필요한 달을 정확히 6행으로 만든다 (2026-05, 1일=금요일, 31일)', () => {
    const grid = buildMonthGrid(new Date(2026, 4, 1))

    expect(grid.length).toBe(6)
  })

  it('행 개수가 5행만 필요한 달을 정확히 5행으로 만든다 (2026-07, 1일=수요일, 31일)', () => {
    const grid = buildMonthGrid(new Date(2026, 6, 1))

    expect(grid.length).toBe(5)
  })

  it('윤년 2월(2028-02)은 isCurrentMonth: true인 셀이 정확히 29개다', () => {
    const grid = buildMonthGrid(new Date(2028, 1, 1))
    const currentMonthCells = grid.flat().filter((cell) => cell.isCurrentMonth)

    expect(currentMonthCells.length).toBe(29)
  })

  it('12월 그리드의 trailing 셀은 다음 해 1월로 롤오버된다 (2026-12)', () => {
    // 2026-12-01은 화요일 -> leadingCount=2, daysInMonth=31 -> rawCount=33 -> totalCells=35 -> trailingCount=2
    const grid = buildMonthGrid(new Date(2026, 11, 1))
    const cells = grid.flat()
    const trailingCells = cells.slice(cells.length - 2)

    expect(trailingCells).toHaveLength(2)
    trailingCells.forEach((cell) => {
      expect(cell.isCurrentMonth).toBe(false)
    })
    expect(trailingCells[0].date.getFullYear()).toBe(2027)
    expect(trailingCells[0].date.getMonth()).toBe(0)
    expect(trailingCells[0].date.getDate()).toBe(1)
    expect(trailingCells[1].date.getFullYear()).toBe(2027)
    expect(trailingCells[1].date.getMonth()).toBe(0)
    expect(trailingCells[1].date.getDate()).toBe(2)
  })

  it('1월 그리드의 leading 셀은 전년도 12월로 롤오버된다 (2026-01)', () => {
    // 2026-01-01은 목요일 -> leadingCount=4 -> 2025-12-28 ~ 2025-12-31
    const grid = buildMonthGrid(new Date(2026, 0, 1))
    const leadingCells = grid[0].slice(0, 4)

    leadingCells.forEach((cell) => {
      expect(cell.isCurrentMonth).toBe(false)
      expect(cell.date.getFullYear()).toBe(2025)
      expect(cell.date.getMonth()).toBe(11)
    })
    expect(leadingCells.map((cell) => cell.date.getDate())).toEqual([28, 29, 30, 31])
  })

  it('모든 행의 길이는 항상 7이고 전체 셀 수는 7의 배수다', () => {
    const months = [
      new Date(2026, 0, 1),
      new Date(2026, 1, 1),
      new Date(2026, 4, 1),
      new Date(2026, 6, 1),
      new Date(2026, 11, 1),
      new Date(2028, 1, 1),
    ]

    months.forEach((referenceDate) => {
      const grid = buildMonthGrid(referenceDate)
      const totalCells = grid.reduce((sum, row) => sum + row.length, 0)

      grid.forEach((row) => {
        expect(row.length).toBe(7)
      })
      expect(totalCells % 7).toBe(0)
    })
  })

  it('입력받은 Date 객체를 변경하지 않는다', () => {
    const referenceDate = new Date(2026, 6, 15)
    const before = referenceDate.getTime()

    buildMonthGrid(referenceDate)

    expect(referenceDate.getTime()).toBe(before)
  })
})

describe('buildWeekDays', () => {
  it('수요일(2026-07-15) 기준 첫 항목은 월요일(07-13), 마지막 항목은 일요일(07-19)이다', () => {
    const days = buildWeekDays(new Date(2026, 6, 15))

    expect(days).toHaveLength(7)
    const first = days[0]
    const last = days[6]

    expect([first.getFullYear(), first.getMonth(), first.getDate()]).toEqual([2026, 6, 13])
    expect([last.getFullYear(), last.getMonth(), last.getDate()]).toEqual([2026, 6, 19])
  })

  it('목요일(2026-01-01)은 그 주의 월요일(2025-12-29)로 롤백된다', () => {
    // 2026-01-01의 요일을 프로그래밍적으로 확인: getDay() === 4 (목요일)
    const referenceDate = new Date(2026, 0, 1)
    expect(referenceDate.getDay()).toBe(4)

    const days = buildWeekDays(referenceDate)
    const first = days[0]

    expect([first.getFullYear(), first.getMonth(), first.getDate()]).toEqual([2025, 11, 29])
  })

  it('일요일 기준 날짜는 다음 주가 아니라 같은 주의 월요일로 롤백된다 (2026-07-19)', () => {
    const referenceDate = new Date(2026, 6, 19)
    expect(referenceDate.getDay()).toBe(0)

    const days = buildWeekDays(referenceDate)
    const first = days[0]
    const last = days[6]

    expect([first.getFullYear(), first.getMonth(), first.getDate()]).toEqual([2026, 6, 13])
    expect([last.getFullYear(), last.getMonth(), last.getDate()]).toEqual([2026, 6, 19])
  })

  it('월 경계를 넘는 주(2026-07-31 금요일 기준)는 7월과 8월에 걸쳐 올바른 날짜를 반환한다', () => {
    const referenceDate = new Date(2026, 6, 31)
    expect(referenceDate.getDay()).toBe(5)

    const days = buildWeekDays(referenceDate)
    const expected = [
      [2026, 6, 27],
      [2026, 6, 28],
      [2026, 6, 29],
      [2026, 6, 30],
      [2026, 6, 31],
      [2026, 7, 1],
      [2026, 7, 2],
    ]

    days.forEach((day, index) => {
      expect([day.getFullYear(), day.getMonth(), day.getDate()]).toEqual(expected[index])
    })
  })

  it('각 항목은 로컬 자정(00:00:00.000)이다', () => {
    const days = buildWeekDays(new Date(2026, 6, 15, 13, 45, 30, 500))

    days.forEach((day) => {
      expect([day.getHours(), day.getMinutes(), day.getSeconds(), day.getMilliseconds()]).toEqual([
        0, 0, 0, 0,
      ])
    })
  })

  it('입력받은 Date 객체를 변경하지 않는다', () => {
    const referenceDate = new Date(2026, 6, 15)
    const before = referenceDate.getTime()

    buildWeekDays(referenceDate)

    expect(referenceDate.getTime()).toBe(before)
  })
})

describe('buildDayTimeSlots', () => {
  it('0시부터 23시까지 순서대로 24개의 슬롯을 반환한다', () => {
    const slots = buildDayTimeSlots(new Date(2026, 6, 15))

    expect(slots).toHaveLength(24)
    expect(slots[0].getHours()).toBe(0)
    expect(slots[23].getHours()).toBe(23)
    slots.forEach((slot, index) => {
      expect(slot.getHours()).toBe(index)
    })
  })

  it('각 슬롯은 분/초/밀리초가 0이고 입력 날짜와 동일한 연/월/일을 가진다', () => {
    const referenceDate = new Date(2026, 6, 15, 9, 30, 15, 250)
    const slots = buildDayTimeSlots(referenceDate)

    slots.forEach((slot) => {
      expect(slot.getMinutes()).toBe(0)
      expect(slot.getSeconds()).toBe(0)
      expect(slot.getMilliseconds()).toBe(0)
      expect(slot.getFullYear()).toBe(2026)
      expect(slot.getMonth()).toBe(6)
      expect(slot.getDate()).toBe(15)
    })
  })

  it('입력받은 Date 객체를 변경하지 않는다', () => {
    const referenceDate = new Date(2026, 6, 15, 9, 30, 15, 250)
    const before = referenceDate.getTime()

    buildDayTimeSlots(referenceDate)

    expect(referenceDate.getTime()).toBe(before)
  })
})

describe('formatDateParam', () => {
  it('월/일이 모두 두 자리인 날짜를 YYYY-MM-DD로 변환한다 (2026-07-15)', () => {
    const result = formatDateParam(new Date(2026, 6, 15))

    expect(result).toBe('2026-07-15')
  })

  it('월이 한 자리라서 zero-padding이 필요한 날짜를 변환한다 (2026-01-05)', () => {
    const result = formatDateParam(new Date(2026, 0, 5))

    expect(result).toBe('2026-01-05')
  })

  it('일이 한 자리라서 zero-padding이 필요한 날짜를 변환한다 (2026-09-01)', () => {
    const result = formatDateParam(new Date(2026, 8, 1))

    expect(result).toBe('2026-09-01')
  })

  it('연말 날짜를 올바르게 변환한다 (2026-12-31)', () => {
    const result = formatDateParam(new Date(2026, 11, 31))

    expect(result).toBe('2026-12-31')
  })

  it('연초 날짜를 올바르게 변환한다 (2026-01-01)', () => {
    const result = formatDateParam(new Date(2026, 0, 1))

    expect(result).toBe('2026-01-01')
  })

  it('입력받은 Date 객체를 변경하지 않는다', () => {
    const referenceDate = new Date(2026, 6, 15, 9, 30, 15, 250)
    const before = referenceDate.getTime()

    formatDateParam(referenceDate)

    expect(referenceDate.getTime()).toBe(before)
  })
})

describe('formatTimeLabel', () => {
  it('자정(00:00)을 zero-padding하여 변환한다', () => {
    const result = formatTimeLabel(new Date(2026, 6, 15, 0, 0))

    expect(result).toBe('00:00')
  })

  it('시/분이 모두 한 자리라서 zero-padding이 필요한 시각을 변환한다 (09:05)', () => {
    const result = formatTimeLabel(new Date(2026, 6, 15, 9, 5))

    expect(result).toBe('09:05')
  })

  it('하루의 마지막 시각(23:59)을 변환한다', () => {
    const result = formatTimeLabel(new Date(2026, 6, 15, 23, 59))

    expect(result).toBe('23:59')
  })

  it('시/분이 모두 두 자리인 시각을 zero-padding 없이 변환한다 (14:30)', () => {
    const result = formatTimeLabel(new Date(2026, 6, 15, 14, 30))

    expect(result).toBe('14:30')
  })
})

describe('addDays', () => {
  it('다음날로 이동한다 (2026-07-15 -> 2026-07-16)', () => {
    const result = addDays(new Date(2026, 6, 15), 1)

    expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([2026, 6, 16])
  })

  it('이전날로 이동한다 (2026-07-15 -> 2026-07-14)', () => {
    const result = addDays(new Date(2026, 6, 15), -1)

    expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([2026, 6, 14])
  })

  it('월 경계를 넘어 이동한다 (2026-07-31 + 1일 -> 2026-08-01)', () => {
    const result = addDays(new Date(2026, 6, 31), 1)

    expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([2026, 7, 1])
  })

  it('연 경계를 넘어 이동한다 (2026-12-31 + 1일 -> 2027-01-01)', () => {
    const result = addDays(new Date(2026, 11, 31), 1)

    expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([2027, 0, 1])
  })

  it('입력받은 Date 객체를 변경하지 않는다', () => {
    const referenceDate = new Date(2026, 6, 15)
    const before = referenceDate.getTime()

    addDays(referenceDate, 1)

    expect(referenceDate.getTime()).toBe(before)
  })
})

describe('addWeeks', () => {
  it('한 주 뒤로 이동한다 (2026-07-15 -> 2026-07-22)', () => {
    const result = addWeeks(new Date(2026, 6, 15), 1)

    expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([2026, 6, 22])
  })

  it('한 주 전으로 이동한다 (2026-07-15 -> 2026-07-08)', () => {
    const result = addWeeks(new Date(2026, 6, 15), -1)

    expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([2026, 6, 8])
  })

  it('월 경계를 넘는 이동을 처리한다 (2026-07-31 + 1주 -> 2026-08-07)', () => {
    const result = addWeeks(new Date(2026, 6, 31), 1)

    expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([2026, 7, 7])
  })

  it('입력받은 Date 객체를 변경하지 않는다', () => {
    const referenceDate = new Date(2026, 6, 15)
    const before = referenceDate.getTime()

    addWeeks(referenceDate, 1)

    expect(referenceDate.getTime()).toBe(before)
  })
})

describe('addMonths', () => {
  it('일반적으로 한 달 전진한다 (2026-07-15 + 1개월 -> 2026-08-15)', () => {
    const result = addMonths(new Date(2026, 6, 15), 1)

    expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([2026, 7, 15])
  })

  it('일반적으로 한 달 후진한다 (2026-07-15 - 1개월 -> 2026-06-15)', () => {
    const result = addMonths(new Date(2026, 6, 15), -1)

    expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([2026, 5, 15])
  })

  it('월말 오버플로를 그 달의 마지막 날로 클램프한다 - 평년 (2026-01-31 + 1개월 -> 2026-02-28)', () => {
    const result = addMonths(new Date(2026, 0, 31), 1)

    expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([2026, 1, 28])
  })

  it('월말 오버플로를 그 달의 마지막 날로 클램프한다 - 윤년 (2028-01-31 + 1개월 -> 2028-02-29)', () => {
    const result = addMonths(new Date(2028, 0, 31), 1)

    expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([2028, 1, 29])
  })

  it('연 경계를 넘어 전진한다 (2026-12-15 + 1개월 -> 2027-01-15)', () => {
    const result = addMonths(new Date(2026, 11, 15), 1)

    expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([2027, 0, 15])
  })

  it('연 경계를 넘어 후진한다 (2026-01-15 - 1개월 -> 2025-12-15)', () => {
    const result = addMonths(new Date(2026, 0, 15), -1)

    expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([2025, 11, 15])
  })

  it('입력받은 Date 객체를 변경하지 않는다', () => {
    const referenceDate = new Date(2026, 6, 15)
    const before = referenceDate.getTime()

    addMonths(referenceDate, 1)

    expect(referenceDate.getTime()).toBe(before)
  })
})

describe('formatMonthLabel', () => {
  it('일반적인 날짜를 "YYYY년 M월"로 변환한다 (2026-07-15)', () => {
    const result = formatMonthLabel(new Date(2026, 6, 15))

    expect(result).toBe('2026년 7월')
  })

  it('월이 한 자리라도 zero-padding하지 않는다 (2026-01-05)', () => {
    const result = formatMonthLabel(new Date(2026, 0, 5))

    expect(result).toBe('2026년 1월')
  })

  it('12월을 변환한다 (2026-12-25)', () => {
    const result = formatMonthLabel(new Date(2026, 11, 25))

    expect(result).toBe('2026년 12월')
  })
})

describe('formatWeekRangeLabel', () => {
  it('수요일(2026-07-15) 기준 주간 범위를 반환한다', () => {
    const result = formatWeekRangeLabel(new Date(2026, 6, 15))

    expect(result).toBe('07/13(월) ~ 07/19(일)')
  })

  it('월 경계를 넘는 주 - 금요일(2026-07-31) 기준 주간 범위를 반환한다', () => {
    const result = formatWeekRangeLabel(new Date(2026, 6, 31))

    expect(result).toBe('07/27(월) ~ 08/02(일)')
  })

  it('목요일(2026-01-01) 기준 주간 범위를 반환한다 (그 주 월요일은 2025-12-29)', () => {
    const result = formatWeekRangeLabel(new Date(2026, 0, 1))

    expect(result).toBe('12/29(월) ~ 01/04(일)')
  })
})

describe('formatDayViewLabel', () => {
  it('화요일(2026-07-14)을 변환한다', () => {
    const result = formatDayViewLabel(new Date(2026, 6, 14))

    expect(result).toBe('2026-07-14(화)')
  })

  it('목요일(2026-01-01)을 변환한다', () => {
    const result = formatDayViewLabel(new Date(2026, 0, 1))

    expect(result).toBe('2026-01-01(목)')
  })

  it('연말 날짜를 변환한다 (2026-12-31)', () => {
    const referenceDate = new Date(2026, 11, 31)
    // new Date(2026, 11, 31).getDay() === 4 (목요일)
    expect(referenceDate.getDay()).toBe(4)

    const result = formatDayViewLabel(referenceDate)

    expect(result).toBe('2026-12-31(목)')
  })
})
