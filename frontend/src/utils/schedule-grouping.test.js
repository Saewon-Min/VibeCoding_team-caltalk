import { describe, it, expect } from 'vitest'
import { groupByLocalDate } from './schedule-grouping.js'

const getDate = (item) => item.date

describe('groupByLocalDate', () => {
  it('빈 배열을 입력하면 빈 Map을 반환한다', () => {
    const result = groupByLocalDate([], getDate)

    expect(result).toBeInstanceOf(Map)
    expect(result.size).toBe(0)
  })

  it('같은 날짜의 여러 항목을 하나의 키로 묶고 시작 시각 순으로 정렬한다', () => {
    const items = [
      { id: 'c', date: new Date(2026, 6, 15, 18, 0) },
      { id: 'a', date: new Date(2026, 6, 15, 9, 0) },
      { id: 'b', date: new Date(2026, 6, 15, 13, 0) },
    ]

    const result = groupByLocalDate(items, getDate)

    expect(result.size).toBe(1)
    const group = result.get('2026-07-15')
    expect(group.map((item) => item.id)).toEqual(['a', 'b', 'c'])
  })

  it('서로 다른 날짜의 항목은 각각 다른 키로 분리된다', () => {
    const items = [
      { id: 'a', date: new Date(2026, 6, 15, 9, 0) },
      { id: 'b', date: new Date(2026, 6, 16, 9, 0) },
      { id: 'c', date: new Date(2026, 6, 17, 9, 0) },
    ]

    const result = groupByLocalDate(items, getDate)

    expect(result.size).toBe(3)
    expect(result.get('2026-07-15').map((item) => item.id)).toEqual(['a'])
    expect(result.get('2026-07-16').map((item) => item.id)).toEqual(['b'])
    expect(result.get('2026-07-17').map((item) => item.id)).toEqual(['c'])
  })

  it('입력 배열과 원소를 변경하지 않는다', () => {
    const items = [
      { id: 'c', date: new Date(2026, 6, 15, 18, 0) },
      { id: 'a', date: new Date(2026, 6, 15, 9, 0) },
      { id: 'b', date: new Date(2026, 6, 15, 13, 0) },
    ]
    const originalOrder = items.map((item) => item.id)
    const originalTimes = items.map((item) => item.date.getTime())

    groupByLocalDate(items, getDate)

    expect(items.map((item) => item.id)).toEqual(originalOrder)
    expect(items.map((item) => item.date.getTime())).toEqual(originalTimes)
  })
})
