// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import {
  DOCX_MIME,
  PDF_MIME,
  calculateScore,
  evaluateFilters,
  extractProfile,
  redact,
  salvageQuote,
  verifyQuote,
  type FilterCheck,
} from '@shortlist/core'
import { parseCvFile } from '@/lib/ingestion/parse'
import { HeuristicProvider } from '@/lib/llm/providers/heuristic'
import { buildSeedCvs } from './cv-data'
import { CRITERIA_A, FILTERS_A } from './scorecard'

interface Scored {
  filename: string
  name: string
  total: number
  isBelowFit: boolean
  unverifiedClaims: number
  verifiedQuotes: string[]
  checks: FilterCheck[]
}

/** The same steps the ingestion pipeline applies: redact, read, salvage + verify quotes, compute the total. */
async function scoreText(filename: string, text: string): Promise<Scored> {
  const profile = extractProfile(text)
  const { redactedText } = redact(text)
  const response = await new HeuristicProvider().score({ redactedText, criteria: CRITERIA_A, cacheKey: 'k' })

  let unverifiedClaims = 0
  const verifiedQuotes: string[] = []
  const results = response.criteria.map((r) => {
    const quote = salvageQuote(r.quote, text)
    const verified = quote !== null && verifyQuote(quote, text).verified
    if (verified && quote) verifiedQuotes.push(quote)
    const unverified = (r.met === 'yes' || r.met === 'partial') && !verified
    if (unverified) unverifiedClaims++
    return { criterionId: r.criterionId, met: unverified ? ('unknown' as const) : r.met, verified }
  })
  const score = calculateScore(CRITERIA_A.map((c) => ({ id: c.id, weight: c.weight, mustHave: c.mustHave })), results)
  return {
    filename,
    name: `${profile.firstName} ${profile.lastName}`.trim(),
    total: score.total,
    isBelowFit: score.isBelowFit,
    unverifiedClaims,
    verifiedQuotes,
    checks: evaluateFilters(FILTERS_A, { experienceYears: profile.experienceYears, noticeDays: profile.statedNoticeDays, location: profile.location }),
  }
}

describe("scoring the brief's example JD with the default (no API key) scorer", () => {
  let all: Scored[] = []
  const byName = (n: string) => all.find((s) => s.name === n) as Scored

  beforeAll(async () => {
    const cvs = (await buildSeedCvs()).filter((c) => c.kind === 'normal')
    all = await Promise.all(
      cvs.map(async (c) => {
        const parsed = await parseCvFile(c.data, c.filename.endsWith('.docx') ? DOCX_MIME : PDF_MIME)
        return scoreText(c.filename, parsed.text)
      }),
    )
  })

  it('never throws away a correct match: every claim the scorer makes is backed by a verifiable quote', () => {
    const bad = all.filter((s) => s.unverifiedClaims > 0).map((s) => `${s.name} (${s.unverifiedClaims})`)
    expect(bad).toEqual([])
  })

  it('quotes are clean single lines that contain no redaction marker or page footer', () => {
    for (const s of all) {
      for (const q of s.verifiedQuotes) {
        expect(q, s.name).not.toMatch(/\[REDACTED|\n|-- \d+ of \d+ --/)
        expect(q.length, s.name).toBeLessThanOrEqual(160)
      }
    }
  })

  it('ranks the brief\'s sample candidates sensibly: Ritika above Pooja above Arjun', () => {
    const [ritika, pooja, arjun] = [byName('Ritika Bansal'), byName('Pooja Nair'), byName('Arjun Rawat')]
    expect(ritika.total).toBeGreaterThan(pooja.total)
    expect(pooja.total).toBeGreaterThan(arjun.total)
    expect(ritika.isBelowFit).toBe(false)
    expect(arjun.isBelowFit).toBe(true) // a KYC analyst is not a Java developer
    expect(arjun.total).toBe(0)
  })

  it('does not give a JavaScript developer credit for Java', async () => {
    const js = await scoreText('js.pdf', 'Dev Sharma\nFrontend Developer\ndev@example.com\nJavaScript, React, TypeScript, interest in forests')
    // Only the "Seniority" criterion (keywords "senior developer") partly matches the word "Developer";
    // Java and Spring Boot (45% of the weight, both must-haves) earn nothing.
    expect(js.total).toBeLessThan(10)
    expect(js.isBelowFit).toBe(true)
  })

  it('applies the JD filters as labels: Ritika meets them, Pooja misses experience and notice', () => {
    expect(byName('Ritika Bansal').checks.map((c) => c.status)).toEqual(['meets', 'meets', 'meets'])
    const pooja = byName('Pooja Nair').checks
    expect(pooja.find((c) => c.id === 'f-exp')).toMatchObject({ status: 'misses', detail: '4 years (wanted 5-8 years)' })
    expect(pooja.find((c) => c.id === 'f-notice')).toMatchObject({ status: 'misses', detail: '90 days (limit 60)' })
  })

  it('keeps every candidate, including those below fit (nobody is dropped)', () => {
    expect(all).toHaveLength(40)
    expect(all.filter((s) => s.isBelowFit).length).toBeGreaterThan(0)
  })
})
