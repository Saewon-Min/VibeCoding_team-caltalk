import { describe, it, expect } from 'vitest'
import { validateChangeRequestForm } from './change-request-form.js'

describe('validateChangeRequestForm', () => {
  it('scheduleId가 없으면 errors.scheduleId가 존재한다', () => {
    const errors = validateChangeRequestForm({ scheduleId: '', reason: '일정 조정 필요' })

    expect(errors.scheduleId).toBe('대상 일정을 선택해주세요.')
  })

  it('reason이 빈 문자열이면 errors.reason이 존재한다', () => {
    const errors = validateChangeRequestForm({ scheduleId: '1', reason: '' })

    expect(errors.reason).toBe('요청 사유를 입력해주세요.')
  })

  it('reason이 공백만 있는 문자열이면 errors.reason이 존재한다', () => {
    const errors = validateChangeRequestForm({ scheduleId: '1', reason: '   ' })

    expect(errors.reason).toBe('요청 사유를 입력해주세요.')
  })

  it('reason이 undefined/누락이면 errors.reason이 존재한다', () => {
    const errors = validateChangeRequestForm({ scheduleId: '1' })

    expect(errors.reason).toBe('요청 사유를 입력해주세요.')
  })

  it('모든 필드가 유효하면 반환 객체에 키가 하나도 없다', () => {
    const errors = validateChangeRequestForm({ scheduleId: '1', reason: '일정 조정 필요' })

    expect(Object.keys(errors).length).toBe(0)
  })

  it('에러가 없는 필드는 반환 객체에 키 자체가 존재하지 않는다', () => {
    const errors = validateChangeRequestForm({ scheduleId: '', reason: '일정 조정 필요' })

    expect('scheduleId' in errors).toBe(true)
    expect('reason' in errors).toBe(false)
  })
})
