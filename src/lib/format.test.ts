import { describe, expect, it } from 'vitest'
import { describeFacts } from './format'

describe('describeFacts', () => {
  it('joins what is stated', () => {
    expect(describeFacts(6.5, 60)).toBe('6.5 years experience · 60 days notice')
  })

  it('leaves out what the CV does not say', () => {
    expect(describeFacts(null, 30)).toBe('30 days notice')
    expect(describeFacts(4, undefined)).toBe('4 years experience')
    expect(describeFacts(null, null)).toBe('')
  })

  it('reads an immediate joiner and singular units', () => {
    expect(describeFacts(1, 0)).toBe('1 year experience · immediate joiner')
    expect(describeFacts(2, 1)).toBe('2 years experience · 1 day notice')
  })
})
