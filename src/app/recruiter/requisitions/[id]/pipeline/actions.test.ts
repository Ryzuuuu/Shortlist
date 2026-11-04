// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  user: { id: 'rec-1', role: 'recruiter', clientId: null } as { id: string; role: string; clientId: string | null },
  stage: 'interview' as string | null,
  update: vi.fn(),
  insert: vi.fn(),
}))

vi.mock('drizzle-orm', () => ({ and: () => ({}), eq: () => ({}) }))
vi.mock('@/db/schema', () => ({ pipelineEntries: {}, auditLog: {} }))
vi.mock('@/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve(h.stage ? [{ stage: h.stage }] : []) }) }) }),
    update: () => ({ set: (v: unknown) => ({ where: () => (h.update(v), Promise.resolve()) }) }),
    insert: () => ({ values: (v: unknown) => (h.insert(v), Promise.resolve()) }),
  },
}))
vi.mock('@/lib/session', () => ({ requireStaff: async () => ({ user: h.user }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { advanceStage } from './actions'

const base = { requisitionId: 'req-1', candidateId: 'cand-1' }

beforeEach(() => {
  vi.clearAllMocks()
  h.user = { id: 'rec-1', role: 'recruiter', clientId: null }
  h.stage = 'interview'
})

describe('advanceStage', () => {
  it('moves interview -> offered and records who did it', async () => {
    expect(await advanceStage({ ...base, to: 'offered' })).toEqual({ ok: true })
    expect(h.update).toHaveBeenCalledWith(expect.objectContaining({ stage: 'offered', updatedByUserId: 'rec-1', rejectionReason: null }))
    expect(h.insert).toHaveBeenCalledWith(expect.objectContaining({ action: 'stage_offered', userId: 'rec-1', metadata: { from: 'interview', to: 'offered' } }))
  })

  it('moves offered -> joined', async () => {
    h.stage = 'offered'
    expect(await advanceStage({ ...base, to: 'joined' })).toEqual({ ok: true })
  })

  it('refuses to skip stages or to make moves that belong to the client or the Submit button', async () => {
    for (const [stage, to] of [['shortlisted', 'offered'], ['interview', 'joined'], ['submitted', 'offered'], ['screened', 'offered']] as const) {
      h.stage = stage
      const r = await advanceStage({ ...base, to })
      expect(r.ok, `${stage} -> ${to}`).toBe(false)
    }
    expect(h.update).not.toHaveBeenCalled()
    expect(h.insert).not.toHaveBeenCalled()
  })

  it('needs a reason to reject, stores it, and lets a recruiter reject at any open stage', async () => {
    expect((await advanceStage({ ...base, to: 'rejected' })).ok).toBe(false)
    expect((await advanceStage({ ...base, to: 'rejected', reason: ' ' })).ok).toBe(false)
    expect(h.update).not.toHaveBeenCalled()

    h.stage = 'submitted'
    expect(await advanceStage({ ...base, to: 'rejected', reason: 'Salary expectation too high' })).toEqual({ ok: true })
    expect(h.update).toHaveBeenCalledWith(expect.objectContaining({ stage: 'rejected', rejectionReason: 'Salary expectation too high' }))
    // The reason is internal: it is stored on the pipeline entry, not copied into the audit metadata.
    expect(JSON.stringify(h.insert.mock.calls)).not.toContain('Salary expectation')
  })

  it('does nothing for a candidate who has already joined or been rejected', async () => {
    for (const stage of ['joined', 'rejected']) {
      h.stage = stage
      expect((await advanceStage({ ...base, to: 'rejected', reason: 'because' })).ok).toBe(false)
    }
    expect(h.update).not.toHaveBeenCalled()
  })

  it('refuses a user whose role the policy does not allow, before touching anything', async () => {
    h.user = { id: 'c-1', role: 'client', clientId: 'A' }
    expect(await advanceStage({ ...base, to: 'offered' })).toEqual({ ok: false, error: 'Not allowed.' })
    expect(h.update).not.toHaveBeenCalled()
  })

  it('reports an unknown candidate and rejects malformed input', async () => {
    h.stage = null
    expect(await advanceStage({ ...base, to: 'offered' })).toEqual({ ok: false, error: 'Candidate is not in this requisition.' })
    expect((await advanceStage({ requisitionId: '', candidateId: 'x', to: 'offered' })).ok).toBe(false)
    expect((await advanceStage({ ...base, to: 'shortlisted' })).ok).toBe(false)
  })
})
