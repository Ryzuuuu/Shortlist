// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
const h = vi.hoisted(() => ({
  user: { id: 'rec-1', role: 'recruiter', clientId: null } as { id: string; role: string; clientId: string | null },
  selects: [] as Row[][],
  inserts: [] as Array<{ table: string; values: Row }>,
  updates: [] as Array<{ table: string; set: Row }>,
}))

vi.mock('drizzle-orm', () => ({ and: () => ({}), eq: () => ({}), isNull: () => ({}) }))
vi.mock('@/db/schema', () => ({
  submissions: { __t: 'submissions' },
  pipelineEntries: { __t: 'pipeline_entries' },
  auditLog: { __t: 'audit_log' },
}))
vi.mock('@/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve(h.selects.shift() ?? []) }) }) }),
    insert: (t: { __t: string }) => ({
      values: (values: Row) => {
        h.inserts.push({ table: t.__t, values })
        return { onConflictDoNothing: () => Promise.resolve(), then: (r: (v: unknown) => unknown) => Promise.resolve().then(r) }
      },
    }),
    update: (t: { __t: string }) => ({
      set: (set: Row) => {
        h.updates.push({ table: t.__t, set })
        return { where: () => Promise.resolve() }
      },
    }),
  },
}))
vi.mock('@/lib/session', () => ({ requireStaff: async () => ({ user: h.user }) }))
vi.mock('@/lib/compliance/delete-candidate', () => ({ deleteCandidateData: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { recordCvView, submitCandidate } from './actions'

const ids = { requisitionId: 'req-1', candidateId: 'cand-1' }

beforeEach(() => {
  h.user = { id: 'rec-1', role: 'recruiter', clientId: null }
  h.selects = []
  h.inserts = []
  h.updates = []
})

describe('recordCvView: opening a CV is what unlocks Submit', () => {
  it('records the first view, moves sourced -> screened, and writes an audit entry', async () => {
    expect(await recordCvView(ids)).toEqual({ ok: true })
    const sub = h.inserts.find((i) => i.table === 'submissions')?.values
    expect(sub).toMatchObject({ candidateId: 'cand-1', requisitionId: 'req-1', submittedByUserId: 'rec-1', viewedByRecruiterAt: expect.any(Date) })
    expect(h.updates.some((u) => u.table === 'pipeline_entries' && u.set.stage === 'screened')).toBe(true)
    expect(h.inserts.find((i) => i.table === 'audit_log')?.values).toMatchObject({ action: 'candidate_viewed', userId: 'rec-1', candidateId: 'cand-1' })
  })

  it('refuses a user the policy does not allow, writing nothing', async () => {
    h.user = { id: 'c-1', role: 'client', clientId: 'A' }
    expect(await recordCvView(ids)).toEqual({ ok: false, error: 'Not allowed.' })
    expect(h.inserts).toEqual([])
    expect(h.updates).toEqual([])
  })

  it('rejects malformed input', async () => {
    expect((await recordCvView({ requisitionId: '', candidateId: 'x' })).ok).toBe(false)
  })
})

describe('submitCandidate: refused unless the recruiter has opened the CV', () => {
  it('refuses when the CV was never opened, and changes nothing', async () => {
    h.selects = [[{ viewedAt: null }]]
    expect(await submitCandidate(ids)).toEqual({ ok: false, error: 'Open the CV before submitting it.' })
    expect(h.updates).toEqual([])
    expect(h.inserts).toEqual([])
  })

  it('refuses when there is no submission row at all (the CV was never opened)', async () => {
    h.selects = [[]]
    expect((await submitCandidate(ids)).ok).toBe(false)
    expect(h.updates).toEqual([])
  })

  it('submits an opened, screened candidate: stage, note and audit entry', async () => {
    h.selects = [[{ viewedAt: new Date() }], [{ stage: 'screened' }]]
    expect(await submitCandidate({ ...ids, note: '  Strong on Spring Boot  ' })).toEqual({ ok: true })
    expect(h.updates.find((u) => u.table === 'pipeline_entries')?.set).toMatchObject({ stage: 'submitted', updatedByUserId: 'rec-1' })
    expect(h.updates.find((u) => u.table === 'submissions')?.set).toMatchObject({ recruiterNote: 'Strong on Spring Boot' })
    expect(h.inserts.find((i) => i.table === 'audit_log')?.values).toMatchObject({ action: 'candidate_submitted' })
  })

  it('refuses a candidate who is not in a stage that can be submitted', async () => {
    for (const stage of ['submitted', 'shortlisted', 'rejected', 'joined']) {
      h.selects = [[{ viewedAt: new Date() }], [{ stage }]]
      h.updates = []
      expect((await submitCandidate(ids)).ok, stage).toBe(false)
      expect(h.updates).toEqual([])
    }
  })

  it('refuses a user the policy does not allow', async () => {
    h.user = { id: 'c-1', role: 'client', clientId: 'A' }
    h.selects = [[{ viewedAt: new Date() }], [{ stage: 'screened' }]]
    expect(await submitCandidate(ids)).toEqual({ ok: false, error: 'Not allowed.' })
    expect(h.updates).toEqual([])
  })
})
