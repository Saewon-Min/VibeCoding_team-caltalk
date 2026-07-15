import { describe, it, expect } from 'vitest'
import { toDateTimeLocalValue, validateScheduleForm } from './schedule-form.js'

describe('validateScheduleForm', () => {
  it('제목이 빈 문자열이면 errors.title이 존재한다', () => {
    const errors = validateScheduleForm({
      title: '',
      startAt: '2026-07-15T09:00',
      endAt: '2026-07-15T10:00',
    })

    expect(errors.title).toBe('제목을 입력해주세요.')
  })

  it('제목이 공백만 있는 문자열이면 errors.title이 존재한다', () => {
    const errors = validateScheduleForm({
      title: '   ',
      startAt: '2026-07-15T09:00',
      endAt: '2026-07-15T10:00',
    })

    expect(errors.title).toBe('제목을 입력해주세요.')
  })

  it('제목이 undefined/누락이면 errors.title이 존재한다', () => {
    const errors = validateScheduleForm({
      startAt: '2026-07-15T09:00',
      endAt: '2026-07-15T10:00',
    })

    expect(errors.title).toBe('제목을 입력해주세요.')
  })

  it('startAt이 빈 문자열이면 errors.startAt이 존재한다', () => {
    const errors = validateScheduleForm({
      title: '회의',
      startAt: '',
      endAt: '2026-07-15T10:00',
    })

    expect(errors.startAt).toBe('시작 일시를 입력해주세요.')
  })

  it('endAt이 빈 문자열이면 errors.endAt이 존재한다', () => {
    const errors = validateScheduleForm({
      title: '회의',
      startAt: '2026-07-15T09:00',
      endAt: '',
    })

    expect(errors.endAt).toBe('종료 일시를 입력해주세요.')
  })

  it('endAt과 startAt이 완전히 같은 시각이면 errors.endAt이 존재한다', () => {
    const errors = validateScheduleForm({
      title: '회의',
      startAt: '2026-07-15T09:00',
      endAt: '2026-07-15T09:00',
    })

    expect(errors.endAt).toBe('종료 일시는 시작 일시보다 이후여야 합니다.')
  })

  it('endAt이 startAt보다 이전이면 errors.endAt이 존재한다', () => {
    const errors = validateScheduleForm({
      title: '회의',
      startAt: '2026-07-15T10:00',
      endAt: '2026-07-15T09:00',
    })

    expect(errors.endAt).toBe('종료 일시는 시작 일시보다 이후여야 합니다.')
  })

  it('자정을 넘기는 일정은 문자열 비교로도 올바르게 유효하다고 판단한다', () => {
    const errors = validateScheduleForm({
      title: '회의',
      startAt: '2026-07-15T23:50',
      endAt: '2026-07-16T00:10',
    })

    expect(Object.keys(errors).length).toBe(0)
  })

  it('모든 필드가 유효하면 반환 객체에 키가 하나도 없다', () => {
    const errors = validateScheduleForm({
      title: '회의',
      startAt: '2026-07-15T09:00',
      endAt: '2026-07-15T10:00',
    })

    expect(Object.keys(errors).length).toBe(0)
  })

  it('에러가 없는 필드는 반환 객체에 키 자체가 존재하지 않는다', () => {
    const errors = validateScheduleForm({
      title: '',
      startAt: '2026-07-15T09:00',
      endAt: '2026-07-15T10:00',
    })

    expect('title' in errors).toBe(true)
    expect('startAt' in errors).toBe(false)
    expect('endAt' in errors).toBe(false)
  })
})

describe('toDateTimeLocalValue', () => {
  it('시/분이 한 자리인 날짜를 zero-padding하여 변환한다 (2026-07-15T09:05)', () => {
    const result = toDateTimeLocalValue(new Date(2026, 6, 15, 9, 5))

    expect(result).toBe('2026-07-15T09:05')
  })

  it('자정(0시 0분)을 정확히 변환한다', () => {
    const result = toDateTimeLocalValue(new Date(2026, 6, 15, 0, 0))

    expect(result).toBe('2026-07-15T00:00')
  })

  it('입력받은 Date 객체를 변경하지 않는다', () => {
    const referenceDate = new Date(2026, 6, 15, 9, 5, 30, 500)
    const before = referenceDate.getTime()

    toDateTimeLocalValue(referenceDate)

    expect(referenceDate.getTime()).toBe(before)
  })
})
