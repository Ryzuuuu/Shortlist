import { describe, it, expect } from 'vitest'
import { locateQuote, verifyQuote } from '../quote-verifier'

const TEXT = 'Worked on Spring   Boot\nmicroservices (REST) for 3 years.'

describe('locateQuote', () => {
  it('finds a quote across differing whitespace and case', () => {
    const q = 'spring boot microservices'
    const span = locateQuote(q, TEXT)
    expect(span).not.toBeNull()
    expect(TEXT.slice(span!.start, span!.end)).toBe('Spring   Boot\nmicroservices')
  })

  it('escapes regex characters in the quote', () => {
    const span = locateQuote('microservices (REST) for', TEXT)
    expect(TEXT.slice(span!.start, span!.end)).toBe('microservices (REST) for')
  })

  it('agrees with verifyQuote: anything that verifies can be located', () => {
    for (const q of ['3 years.', 'WORKED ON spring', 'boot microservices (rest)']) {
      expect(verifyQuote(q, TEXT).verified).toBe(true)
      expect(locateQuote(q, TEXT)).not.toBeNull()
    }
  })

  it('returns null for empty or absent quotes', () => {
    expect(locateQuote('', TEXT)).toBeNull()
    expect(locateQuote(null, TEXT)).toBeNull()
    expect(locateQuote('kubernetes', TEXT)).toBeNull()
  })
})
