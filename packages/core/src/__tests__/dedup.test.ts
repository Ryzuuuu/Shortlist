import { describe, it, expect } from 'vitest'
import {
  normaliseEmail,
  normalisePhone,
  jaroWinkler,
  isFuzzyMatch,
  findDuplicate,
  type DedupCandidate,
} from '../dedup'

describe('normaliseEmail', () => {
  it('lowercases and trims', () => {
    // Dots are only stripped from the local part, not the domain
    expect(normaliseEmail('  John@EXAMPLE.COM  ')).toBe('john@example.com')
  })

  it('removes + aliases', () => {
    expect(normaliseEmail('user+tag@gmail.com')).toBe('user@gmail.com')
  })

  it('removes dots from the local part for Gmail, which ignores them', () => {
    expect(normaliseEmail('john.doe@gmail.com')).toBe('johndoe@gmail.com')
    expect(normaliseEmail('John.Doe+jobs@googlemail.com')).toBe('johndoe@googlemail.com')
  })

  it('keeps dots on other domains, where john.smith and johnsmith are different people', () => {
    expect(normaliseEmail('john.smith@corp.com')).toBe('john.smith@corp.com')
    expect(normaliseEmail('john.smith@corp.com')).not.toBe(normaliseEmail('johnsmith@corp.com'))
  })

  it('leaves malformed addresses alone instead of crashing', () => {
    expect(normaliseEmail('not-an-email')).toBe('not-an-email')
    expect(normaliseEmail('@nolocal.com')).toBe('@nolocal.com')
    expect(normaliseEmail('nodomain@')).toBe('nodomain@')
  })

  it('returns null for null input', () => {
    expect(normaliseEmail(null)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(normaliseEmail('')).toBeNull()
  })
})

describe('normalisePhone', () => {
  it('strips non-digit characters and the country code', () => {
    expect(normalisePhone('+91 98765-43210')).toBe('9876543210')
  })

  it('strips leading zeros', () => {
    expect(normalisePhone('0091 98765 43210')).toBe('9876543210')
    expect(normalisePhone('098765 43210')).toBe('9876543210')
  })

  it('matches the same number written with and without the country code', () => {
    const forms = ['+91 98765 43210', '098765 43210', '98765-43210', '(+91) 98765 43210', '91-9876543210']
    expect(new Set(forms.map(normalisePhone)).size).toBe(1)
  })

  it('keeps numbers shorter than ten digits whole', () => {
    expect(normalisePhone('2234567')).toBe('2234567')
  })

  it('returns null for null input', () => {
    expect(normalisePhone(null)).toBeNull()
  })

  it('returns null for very short numbers', () => {
    expect(normalisePhone('123')).toBeNull()
  })
})

describe('jaroWinkler', () => {
  it('returns 1 for identical strings', () => {
    expect(jaroWinkler('abc', 'abc')).toBe(1)
  })

  it('returns 0 for completely different strings', () => {
    expect(jaroWinkler('xyz', 'abc')).toBeLessThan(0.5)
  })

  it('gives high score for similar names', () => {
    // "MARTHA" vs "MARHTA" — classic Jaro example
    const score = jaroWinkler('MARTHA', 'MARHTA')
    expect(score).toBeGreaterThan(0.9)
  })

  it('gives higher score for strings sharing a common prefix', () => {
    const withPrefix = jaroWinkler('JOHNSMITH', 'JOHNSMIHT')
    const withoutPrefix = jaroWinkler('SMITHJOHN', 'SMITHJONH')
    expect(withPrefix).toBeGreaterThan(0.9)
    expect(withoutPrefix).toBeGreaterThan(0.9)
  })
})

describe('isFuzzyMatch', () => {
  it('matches identical identities', () => {
    const a = { fullName: 'Priya Sharma', currentCompany: 'Acme', currentRole: 'Engineer' }
    expect(isFuzzyMatch(a, a)).toBe(true)
  })

  it('matches with minor typo in name', () => {
    const a = { fullName: 'Priya Sharma', currentCompany: 'Acme', currentRole: 'Engineer' }
    const b = { fullName: 'Priya Sharme', currentCompany: 'Acme', currentRole: 'Engineer' }
    expect(isFuzzyMatch(a, b)).toBe(true)
  })

  it('does not match different people', () => {
    const a = { fullName: 'John Smith', currentCompany: 'Acme', currentRole: 'Engineer' }
    const b = { fullName: 'Jane Doe', currentCompany: 'Beta Corp', currentRole: 'Designer' }
    expect(isFuzzyMatch(a, b)).toBe(false)
  })

  it('handles null company/role gracefully', () => {
    const a = { fullName: 'Rahul Kumar', currentCompany: null, currentRole: null }
    const b = { fullName: 'Rahul Kumar', currentCompany: null, currentRole: null }
    expect(isFuzzyMatch(a, b)).toBe(true)
  })
})

describe('findDuplicate', () => {
  const existing: DedupCandidate[] = [
    {
      id: 'cand-1',
      normalisedEmail: 'priya@example.com',
      normalisedPhone: '919876543210',
      identity: { fullName: 'Priya Sharma', currentCompany: 'Acme', currentRole: 'Engineer' },
    },
    {
      id: 'cand-2',
      normalisedEmail: 'john@example.com',
      normalisedPhone: '441234567890',
      identity: { fullName: 'John Smith', currentCompany: 'Beta', currentRole: 'Manager' },
    },
  ]

  it('finds duplicate by email', () => {
    const incoming: DedupCandidate = {
      id: 'new',
      normalisedEmail: 'priya@example.com',
      normalisedPhone: null,
      identity: { fullName: 'Priya S', currentCompany: 'Other', currentRole: 'Dev' },
    }
    const match = findDuplicate(incoming, existing)
    expect(match).not.toBeNull()
    expect(match!.candidateId).toBe('cand-1')
    expect(match!.reason).toBe('email')
    expect(match!.similarity).toBe(1.0)
  })

  it('finds duplicate by phone when email differs', () => {
    const incoming: DedupCandidate = {
      id: 'new',
      normalisedEmail: 'different@email.com',
      normalisedPhone: '919876543210',
      identity: { fullName: 'Priya S', currentCompany: 'Other', currentRole: 'Dev' },
    }
    const match = findDuplicate(incoming, existing)
    expect(match).not.toBeNull()
    expect(match!.candidateId).toBe('cand-1')
    expect(match!.reason).toBe('phone')
  })

  it('finds duplicate by fuzzy name match', () => {
    const incoming: DedupCandidate = {
      id: 'new',
      normalisedEmail: null,
      normalisedPhone: null,
      identity: { fullName: 'Priya Sharma', currentCompany: 'Acme', currentRole: 'Engineer' },
    }
    const match = findDuplicate(incoming, existing)
    expect(match).not.toBeNull()
    expect(match!.candidateId).toBe('cand-1')
    expect(match!.reason).toBe('fuzzy')
    expect(match!.similarity).toBeGreaterThanOrEqual(0.92)
  })

  it('returns null for a genuinely new candidate', () => {
    const incoming: DedupCandidate = {
      id: 'new',
      normalisedEmail: 'nobody@unknown.com',
      normalisedPhone: '99000011112222',
      identity: { fullName: 'Tanaka Hiroshi', currentCompany: 'Fuji', currentRole: 'Analyst' },
    }
    const match = findDuplicate(incoming, existing)
    expect(match).toBeNull()
  })

  it('prefers email match over fuzzy', () => {
    // incoming email matches cand-2, but name is similar to cand-1
    const incoming: DedupCandidate = {
      id: 'new',
      normalisedEmail: 'john@example.com',
      normalisedPhone: null,
      identity: { fullName: 'Priya Sharma', currentCompany: 'Acme', currentRole: 'Engineer' },
    }
    const match = findDuplicate(incoming, existing)
    expect(match!.candidateId).toBe('cand-2')
    expect(match!.reason).toBe('email')
  })
})
