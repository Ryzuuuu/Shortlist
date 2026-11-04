// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
const state = vi.hoisted(() => ({
  selects: {} as Record<string, Row[][]>,
  inserts: [] as Array<{ table: string; values: Row }>,
  updates: [] as Array<{ table: string; set: Row }>,
  deletes: [] as string[],
  parse: undefined as unknown,
  llm: undefined as unknown,
  provider: undefined as unknown,
  scoreRequests: [] as Array<{ redactedText: string }>,
}))

vi.mock('drizzle-orm', () => ({ and: () => ({}), desc: () => ({}), eq: () => ({}), gte: () => ({}), isNull: () => ({}), ne: () => ({}) }))
vi.mock('@/db/schema', () => ({
  candidates: { __t: 'candidates' },
  cvFiles: { __t: 'cv_files' },
  pipelineEntries: { __t: 'pipeline_entries' },
  scorecards: { __t: 'scorecards' },
  scores: { __t: 'scores' },
  aiReviewSamples: { __t: 'ai_review_samples' },
}))
vi.mock('@/db', () => {
  const take = (t: string) => state.selects[t]?.shift() ?? []
  return {
    db: {
      select: () => ({
        from: (t: { __t: string }) => {
          const chain: Record<string, unknown> = {}
          chain.where = () => chain
          chain.orderBy = () => chain
          chain.limit = () => Promise.resolve(take(t.__t))
          chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(take(t.__t)).then(res, rej)
          return chain
        },
      }),
      insert: (t: { __t: string }) => ({
        values: (values: Row) => {
          state.inserts.push({ table: t.__t, values })
          return { onConflictDoNothing: () => Promise.resolve(), then: (r: (v: unknown) => unknown) => Promise.resolve().then(r) }
        },
      }),
      update: (t: { __t: string }) => ({
        set: (set: Row) => {
          state.updates.push({ table: t.__t, set })
          return { where: () => Promise.resolve() }
        },
      }),
      delete: (t: { __t: string }) => ({ where: () => (state.deletes.push(t.__t), Promise.resolve()) }),
    },
  }
})
vi.mock('./storage', () => ({ getFile: async () => Buffer.from('bytes') }))
vi.mock('./parse', () => ({ parseCvFile: async () => state.parse }))
vi.mock('@/lib/llm', () => ({
  getLLMProvider: async () => state.provider,
  isVisionCapable: (p: { supportsVision?: boolean }) => p?.supportsVision === true,
  scoreWithCache: async (_hash: string, _sc: string, req: { redactedText: string }) => {
    state.scoreRequests.push(req)
    if (state.llm instanceof Error) throw state.llm
    return state.llm
  },
}))

import { LLMRefusalError } from '@/lib/llm/shared'
import { processCvFile } from './process'

const CV = `Ritika Bansal
Senior Java Developer
ritika.bansal@example.com | +91 98765 43210
Senior Java Developer at Acme Bank
Java, Spring Boot, microservices
6.5 years of experience. Notice period: 60 days.`

const scorecard = {
  id: 'sc-1',
  version: 1,
  criteria: [
    { id: 'c-java', label: 'Java', description: 'Java', weight: 0.5, mustHave: true },
    { id: 'c-spring', label: 'Spring Boot', description: 'Spring Boot', weight: 0.3, mustHave: false },
    { id: 'c-micro', label: 'Microservices', description: 'microservices', weight: 0.2, mustHave: false },
  ],
}

const answer = (rows: Array<[string, 'yes' | 'partial' | 'no' | 'unknown', string | null, number]>) => ({
  provider: 'heuristic',
  fromCache: false,
  criteria: rows.map(([criterionId, met, quote, confidence]) => ({ criterionId, met, quote, confidence })),
})

const GOOD = answer([
  ['c-java', 'yes', 'Senior Java Developer at Acme Bank', 0.9],
  ['c-spring', 'yes', '10 years of Spring Boot mastery', 0.9], // fabricated: not in the CV
  ['c-micro', 'partial', 'microservices', 0.8],
])

function arrange(opts: {
  pool?: Row[]
  parse?: Row
  llm?: unknown
  provider?: unknown
  scorecard?: Row | null
  rivals?: Row[]
  createdAt?: Date
} = {}) {
  state.selects = {
    cv_files: [[{ id: 'f1', storageUrl: 'local:f1', mimeType: 'application/pdf', requisitionId: 'req-1', uploadedByUserId: 'u1' }]],
    candidates: [
      opts.pool ?? [],
      [{ createdAt: opts.createdAt ?? new Date('2026-11-04T10:00:00Z') }],
      opts.rivals ?? [],
      [{ rawText: CV, contentHash: 'hash-1' }],
    ],
    scorecards: [opts.scorecard === null ? [] : [opts.scorecard ?? scorecard]],
  }
  state.parse = opts.parse ?? { text: CV, isScanned: false, failed: false, contentHash: 'hash-1' }
  state.llm = opts.llm ?? GOOD
  state.provider = opts.provider ?? { name: 'heuristic' }
}

const scoresInsert = () => state.inserts.find((i) => i.table === 'scores')?.values as Row
const lastFileStatus = () => [...state.updates].reverse().find((u) => u.table === 'cv_files' && u.set.status)?.set as Row

beforeEach(() => {
  state.inserts = []
  state.updates = []
  state.deletes = []
  state.scoreRequests = []
})

describe('AI rule 1: the total is computed by code, from the scorecard weights', () => {
  it('derives the total from met-values and weights, not from anything the model says', async () => {
    arrange()
    expect(await processCvFile('f1')).toBe('scored')
    // java yes (0.5) + spring unverified -> unknown (0) + micro partial (0.5 x 0.2) = 0.6 -> 60
    expect(scoresInsert()).toMatchObject({ total: 60, isBelowFit: false, candidateId: expect.any(String), scorecardId: 'sc-1' })
  })
})

describe('AI rule 2: every quote is verified against the CV', () => {
  it('drops a fabricated quote, marks it unverified, and does not count the claim', async () => {
    arrange()
    await processCvFile('f1')
    const per = scoresInsert().perCriterion as Row[]
    expect(per.find((c) => c.criterionId === 'c-java')).toMatchObject({ quote: 'Senior Java Developer at Acme Bank', evidenceStatus: 'verified', effectiveMet: 'yes' })
    expect(per.find((c) => c.criterionId === 'c-spring')).toMatchObject({ met: 'yes', quote: null, evidenceStatus: 'unverified', effectiveMet: 'unknown' })
    expect(JSON.stringify(per)).not.toContain('mastery') // the invented text never reaches storage
  })

  it('accepts a quote that differs only in case and whitespace', async () => {
    arrange({ llm: answer([['c-java', 'yes', 'senior   JAVA developer\nat acme bank', 0.9], ['c-spring', 'no', null, 0.9], ['c-micro', 'no', null, 0.9]]) })
    await processCvFile('f1')
    const per = scoresInsert().perCriterion as Row[]
    expect(per[0]).toMatchObject({ evidenceStatus: 'verified', effectiveMet: 'yes' })
  })
})

describe('AI rule 3: the model only sees redacted text', () => {
  it('removes e-mail and phone before scoring', async () => {
    arrange()
    await processCvFile('f1')
    const sent = state.scoreRequests[0]?.redactedText ?? ''
    expect(sent).not.toContain('ritika.bansal@example.com')
    expect(sent).not.toContain('98765 43210')
    expect(sent).toContain('Spring Boot') // the useful content is still there
  })
})

describe('AI rule 4: low scorers are kept and labelled, never dropped', () => {
  it('stores a zero-scoring candidate as below fit and still marks the file scored', async () => {
    arrange({ llm: answer([['c-java', 'no', null, 0.9], ['c-spring', 'no', null, 0.9], ['c-micro', 'no', null, 0.9]]) })
    expect(await processCvFile('f1')).toBe('scored')
    expect(scoresInsert()).toMatchObject({ total: 0, isBelowFit: true })
  })
})

describe('AI rule 5: uncertainty and failure go to a person, never silently', () => {
  it('low confidence -> needs_review (the score is still saved)', async () => {
    arrange({ llm: answer([['c-java', 'yes', 'Senior Java Developer at Acme Bank', 0.2], ['c-spring', 'no', null, 0.3], ['c-micro', 'no', null, 0.2]]) })
    expect(await processCvFile('f1')).toBe('needs_review')
    expect(lastFileStatus()).toMatchObject({ status: 'needs_review', errorMessage: 'Low AI confidence. Review manually.' })
    expect(scoresInsert()).toBeDefined()
  })

  it('a scan with no vision provider -> needs_review, no candidate created', async () => {
    arrange({ parse: { text: '', isScanned: true, failed: false, contentHash: 'h' } })
    expect(await processCvFile('f1')).toBe('needs_review')
    expect(lastFileStatus()).toMatchObject({ status: 'needs_review', isScanned: true })
    expect(String(lastFileStatus().errorMessage)).toMatch(/no vision-capable AI provider/)
    expect(state.inserts.find((i) => i.table === 'candidates')).toBeUndefined()
  })

  it('a scan the vision provider cannot read -> needs_review with a different message', async () => {
    arrange({ parse: { text: '', isScanned: true, failed: false, contentHash: 'h' }, provider: { supportsVision: true, extractTextFromImage: async () => null } })
    expect(await processCvFile('f1')).toBe('needs_review')
    expect(String(lastFileStatus().errorMessage)).toMatch(/could not transcribe/)
  })

  it('a scan the vision provider can read is processed like any other CV', async () => {
    arrange({ parse: { text: '', isScanned: true, failed: false, contentHash: 'hash-1' }, provider: { supportsVision: true, extractTextFromImage: async () => CV } })
    expect(await processCvFile('f1')).toBe('scored')
    expect(lastFileStatus()).toMatchObject({ status: 'scored', isScanned: true })
  })

  it('an unparseable file -> failed with the reason', async () => {
    arrange({ parse: { text: '', isScanned: false, failed: true, errorMessage: 'bad pdf', contentHash: 'h' } })
    expect(await processCvFile('f1')).toBe('failed')
    expect(lastFileStatus()).toMatchObject({ status: 'failed', errorMessage: 'bad pdf' })
  })

  it('the AI reader declining -> needs_review, not a failure to retry', async () => {
    arrange({ llm: new LLMRefusalError() })
    expect(await processCvFile('f1')).toBe('needs_review')
    expect(String(lastFileStatus().errorMessage)).toMatch(/declined/)
    expect(lastFileStatus().candidateId).toEqual(expect.any(String)) // the candidate is kept
  })

  it('a provider error -> failed (retryable) with a bounded message', async () => {
    arrange({ llm: new Error('x'.repeat(1000)) })
    expect(await processCvFile('f1')).toBe('failed')
    expect(String(lastFileStatus().errorMessage)).toHaveLength(300)
  })

  it('no scorecard yet -> needs_review', async () => {
    arrange({ scorecard: null })
    expect(await processCvFile('f1')).toBe('needs_review')
    expect(String(lastFileStatus().errorMessage)).toMatch(/No scorecard/)
  })
})

describe('profiles and duplicates', () => {
  it('saves the facts the filters need onto the profile', async () => {
    arrange()
    await processCvFile('f1')
    const profile = state.inserts.find((i) => i.table === 'candidates')?.values.profile as Row
    expect(profile).toMatchObject({ firstName: 'Ritika', lastName: 'Bansal', experienceYears: 6.5, noticeDays: 60 })
  })

  it('reuses an existing candidate matched by e-mail instead of inserting another', async () => {
    arrange({ pool: [{ id: 'existing', normalisedEmail: 'ritika.bansal@example.com', normalisedPhone: null, profile: { firstName: 'Ritika', lastName: 'Bansal', currentCompany: null, currentRole: null } }] })
    state.selects.candidates = [state.selects.candidates?.[0] ?? [], [{ rawText: CV, contentHash: 'hash-1' }]]
    await processCvFile('f1')
    expect(state.inserts.find((i) => i.table === 'candidates')).toBeUndefined()
    expect(scoresInsert()).toMatchObject({ candidateId: 'existing' })
  })

  it('a concurrent upload of the same person: the later insert defers to the earlier one', async () => {
    arrange({
      createdAt: new Date('2026-11-04T10:00:05Z'),
      rivals: [{ id: 'earlier', createdAt: new Date('2026-11-04T10:00:01Z'), normalisedEmail: 'ritika.bansal@example.com', normalisedPhone: null, profile: { firstName: 'Ritika', lastName: 'Bansal', currentCompany: null, currentRole: null } }],
    })
    await processCvFile('f1')
    expect(state.deletes).toEqual(['candidates']) // its own just-inserted row is removed
    expect(scoresInsert()).toMatchObject({ candidateId: 'earlier' })
  })

  it('does not defer to a rival that was created later (so exactly one copy survives)', async () => {
    arrange({
      createdAt: new Date('2026-11-04T10:00:01Z'),
      rivals: [{ id: 'later', createdAt: new Date('2026-11-04T10:00:09Z'), normalisedEmail: 'ritika.bansal@example.com', normalisedPhone: null, profile: { firstName: 'Ritika', lastName: 'Bansal', currentCompany: null, currentRole: null } }],
    })
    await processCvFile('f1')
    expect(state.deletes).toEqual([])
    expect(scoresInsert()?.candidateId).not.toBe('later')
  })
})
