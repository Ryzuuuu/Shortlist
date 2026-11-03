import { describe, it, expect } from 'vitest'
import { compareRanks, toCsv, weekBounds } from '../agreement'

const ranking = [
  { candidateId: 'a', total: 90 },
  { candidateId: 'b', total: 80 },
  { candidateId: 'c', total: 70 },
  { candidateId: 'd', total: 60 },
  { candidateId: 'e', total: 20 },
]

describe('compareRanks', () => {
  it('is 100% when the recruiter submitted exactly the AI top N', () => {
    const r = compareRanks(ranking, new Set(['a', 'b']))
    expect(r).toMatchObject({ submittedCount: 2, agreedCount: 2, agreementPct: 100, disagreements: [] })
  })

  it('lists submitted candidates ranked below the AI top N, with their rank', () => {
    const r = compareRanks(ranking, new Set(['a', 'e']))
    expect(r.agreementPct).toBe(50)
    expect(r.submitted.map((c) => [c.candidateId, c.rank])).toEqual([['a', 1], ['e', 5]])
    expect(r.disagreements).toEqual([{ candidateId: 'e', total: 20, rank: 5 }])
    expect(r.notSubmittedInTopN.map((c) => c.candidateId)).toEqual(['b'])
  })

  it('treats a submitted candidate tied with the cutoff as agreeing', () => {
    const tied = [
      { candidateId: 'a', total: 80 },
      { candidateId: 'b', total: 80 },
      { candidateId: 'c', total: 50 },
    ]
    const r = compareRanks(tied, new Set(['b']))
    expect(r.agreementPct).toBe(100)
    expect(r.disagreements).toEqual([])
  })

  it('uses competition ranking for ties', () => {
    const r = compareRanks([{ candidateId: 'a', total: 80 }, { candidateId: 'b', total: 80 }, { candidateId: 'c', total: 10 }], new Set(['c']))
    expect(r.disagreements[0]?.rank).toBe(3)
  })

  it('returns null agreement when nothing was submitted, and ignores unscored ids', () => {
    expect(compareRanks(ranking, new Set()).agreementPct).toBeNull()
    expect(compareRanks(ranking, new Set(['ghost'])).submittedCount).toBe(0)
  })
})

describe('weekBounds (IST, Monday start)', () => {
  it('starts the week at Monday 00:00 IST', () => {
    // Wed 2026-11-04 12:00 UTC is Wed 17:30 IST
    const { start, end } = weekBounds(new Date('2026-11-04T12:00:00Z'))
    expect(start.toISOString()).toBe('2026-11-01T18:30:00.000Z') // Mon 2026-11-02 00:00 IST
    expect(end.getTime() - start.getTime()).toBe(7 * 86_400_000)
  })

  it('uses the IST date, not the UTC date, near midnight', () => {
    // Sun 2026-11-01 20:00 UTC is already Mon 2026-11-02 01:30 IST
    const { start } = weekBounds(new Date('2026-11-01T20:00:00Z'))
    expect(start.toISOString()).toBe('2026-11-01T18:30:00.000Z')
  })

  it('steps back whole weeks', () => {
    const now = weekBounds(new Date('2026-11-04T12:00:00Z'), 0)
    const prev = weekBounds(new Date('2026-11-04T12:00:00Z'), 1)
    expect(now.start.getTime() - prev.start.getTime()).toBe(7 * 86_400_000)
  })
})

describe('toCsv', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(toCsv([['a,b', 'say "hi"', 'x\ny', 1, true, null]])).toBe('"a,b","say ""hi""","x\ny",1,true,\r\n')
  })

  it('defuses spreadsheet formulas in text cells but leaves numbers alone', () => {
    expect(toCsv([['=HYPERLINK("http://x")', '+1', '-2', '@sum', -5]])).toBe(`"'=HYPERLINK(""http://x"")",'+1,'-2,'@sum,-5\r\n`)
  })
})
