import { describe, it, expect } from 'vitest'
import { mergeNewMessages, getNextSince } from './chat-history.js'

describe('mergeNewMessages', () => {
  it('기존 배열이 빈 배열이고 새 메시지 2개가 들어오면 결과에 그 2개가 순서대로 포함된다', () => {
    const result = mergeNewMessages([], [{ id: 1 }, { id: 2 }])

    expect(result.map((item) => item.id)).toEqual([1, 2])
  })

  it('겹치지 않는 새 메시지가 기존 배열 뒤에 순서대로 이어붙는다', () => {
    const existing = [{ id: 1 }, { id: 2 }]
    const incoming = [{ id: 3 }, { id: 4 }]

    const result = mergeNewMessages(existing, incoming)

    expect(result.map((item) => item.id)).toEqual([1, 2, 3, 4])
  })

  it('기존 배열에 이미 있는 id를 가진 메시지가 다시 들어와도 중복으로 추가되지 않는다', () => {
    const existing = [{ id: 1 }, { id: 2 }]
    const incoming = [{ id: 2 }, { id: 3 }]

    const result = mergeNewMessages(existing, incoming)

    expect(result.map((item) => item.id)).toEqual([1, 2, 3])
  })

  it('incoming이 빈 배열이면 existing과 동일한 참조를 반환한다', () => {
    const existing = [{ id: 1 }, { id: 2 }]

    const result = mergeNewMessages(existing, [])

    expect(result).toBe(existing)
  })

  it('원본 existing, incoming 배열을 변형하지 않는다', () => {
    const existing = [{ id: 1 }, { id: 2 }]
    const incoming = [{ id: 2 }, { id: 3 }]

    mergeNewMessages(existing, incoming)

    expect(existing.map((item) => item.id)).toEqual([1, 2])
    expect(incoming.map((item) => item.id)).toEqual([2, 3])
  })
})

describe('getNextSince', () => {
  it('incoming이 비어있지 않으면 마지막 원소의 createdAt을 반환한다', () => {
    const incoming = [
      { createdAt: '2026-07-14T10:00:00Z' },
      { createdAt: '2026-07-14T10:05:00Z' },
    ]

    const result = getNextSince(null, incoming)

    expect(result).toBe('2026-07-14T10:05:00Z')
  })

  it('incoming이 빈 배열이면 currentSince가 null일 때 null을 그대로 반환한다', () => {
    const result = getNextSince(null, [])

    expect(result).toBe(null)
  })

  it('incoming이 빈 배열이면 currentSince가 문자열일 때 그 값을 그대로 반환한다', () => {
    const result = getNextSince('2026-07-14T09:00:00Z', [])

    expect(result).toBe('2026-07-14T09:00:00Z')
  })
})
