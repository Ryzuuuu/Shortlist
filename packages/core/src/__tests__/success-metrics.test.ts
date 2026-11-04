import { describe, expect, it } from 'vitest'
import { clientAcceptance, shortlistTimeliness } from '../success-metrics'

const at = (iso: string) => new Date(iso)
const NOW = at('2026-11-10T12:00:00Z')

describe('shortlistTimeliness', () => {
  it('counts a first submission inside 48 hours as met, and one outside as missed', () => {
    const r = shortlistTimeliness(
      [
        { createdAt: at('2026-11-01T09:00:00Z'), firstSubmittedAt: at('2026-11-02T09:00:00Z') }, // 24h
        { createdAt: at('2026-11-01T09:00:00Z'), firstSubmittedAt: at('2026-11-03T09:00:00Z') }, // exactly 48h: met
        { createdAt: at('2026-11-01T09:00:00Z'), firstSubmittedAt: at('2026-11-04T09:00:00Z') }, // 72h: missed
      ],
      NOW,
    )
    expect(r).toEqual({ met: 2, total: 3, pct: 67 })
  })

  it('counts an old requisition with nothing submitted as missed, but a new one as still in its window', () => {
    const r = shortlistTimeliness(
      [
        { createdAt: at('2026-11-01T09:00:00Z'), firstSubmittedAt: null }, // open 9 days, nothing sent
        { createdAt: at('2026-11-10T09:00:00Z'), firstSubmittedAt: null }, // opened 3 hours ago
      ],
      NOW,
    )
    expect(r).toEqual({ met: 0, total: 1, pct: 0 })
  })

  it('has no percentage until something is countable', () => {
    expect(shortlistTimeliness([], NOW).pct).toBeNull()
    expect(shortlistTimeliness([{ createdAt: at('2026-11-10T09:00:00Z'), firstSubmittedAt: null }], NOW).pct).toBeNull()
  })
})

describe('clientAcceptance', () => {
  it('is shortlists over shortlists plus rejections, and ignores interview proposals', () => {
    expect(clientAcceptance(['shortlist', 'shortlist', 'reject', 'propose_interview', 'shortlist'])).toEqual({ met: 3, total: 4, pct: 75 })
  })

  it('has no percentage before any decision', () => {
    expect(clientAcceptance([])).toEqual({ met: 0, total: 0, pct: null })
    expect(clientAcceptance(['propose_interview']).pct).toBeNull()
  })
})
