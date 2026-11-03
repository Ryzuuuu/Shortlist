import { beforeEach, describe, expect, it, vi } from 'vitest'

const write = vi.hoisted(() => ({ update: vi.fn(), insert: vi.fn() }))
const portal = vi.hoisted(() => ({ getPortalRequisition: vi.fn(), getPortalCandidate: vi.fn() }))

vi.mock('@/db', () => {
  const chain = () => ({ set: () => ({ where: () => Promise.resolve() }), values: () => Promise.resolve() })
  return {
    db: {
      update: (...a: unknown[]) => (write.update(...a), chain()),
      insert: (...a: unknown[]) => (write.insert(...a), chain()),
    },
  }
})
vi.mock('@/lib/session', () => ({
  requireClient: async () => ({ user: { id: 'u-a', role: 'client', clientId: 'client-A' } }),
}))
vi.mock('@/lib/queries/portal', () => portal)
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { proposeInterview, rejectCandidate, shortlistCandidate } from './actions'

const ids = { requisitionId: 'req-1', candidateId: 'cand-1' }
const candidate = (stage: string, actions: string[]) => ({ submissionId: 'sub-1', stage, actions })

beforeEach(() => {
  vi.clearAllMocks()
  portal.getPortalRequisition.mockResolvedValue({ id: 'req-1', clientId: 'client-A' })
  portal.getPortalCandidate.mockResolvedValue(candidate('submitted', ['shortlist', 'reject']))
})

describe('client feedback actions: isolation', () => {
  it("refuses a requisition that is not the caller's client's and writes nothing", async () => {
    portal.getPortalRequisition.mockResolvedValue(null) // query is scoped by clientId, so client B's req is null for client A
    expect(await shortlistCandidate(ids)).toEqual({ ok: false, error: 'Not found.' })
    expect(portal.getPortalRequisition).toHaveBeenCalledWith('req-1', 'client-A')
    expect(write.update).not.toHaveBeenCalled()
    expect(write.insert).not.toHaveBeenCalled()
  })

  it('refuses a candidate the recruiter has not submitted to this client', async () => {
    portal.getPortalCandidate.mockResolvedValue(null)
    expect(await shortlistCandidate(ids)).toEqual({ ok: false, error: 'Not found.' })
    expect(write.update).not.toHaveBeenCalled()
  })

  it('refuses an action the current stage does not allow', async () => {
    portal.getPortalCandidate.mockResolvedValue(candidate('shortlisted', ['propose_interview', 'reject']))
    const r = await shortlistCandidate(ids)
    expect(r.ok).toBe(false)
    expect(write.update).not.toHaveBeenCalled()
  })

  it('shortlists a submitted candidate: moves the stage, records feedback and an audit entry', async () => {
    expect(await shortlistCandidate(ids)).toEqual({ ok: true })
    expect(write.update).toHaveBeenCalledTimes(1)
    expect(write.insert).toHaveBeenCalledTimes(2) // client_feedback + audit_log
  })
})

describe('client feedback actions: validation', () => {
  it('requires a reason to reject', async () => {
    const r = await rejectCandidate({ ...ids, reason: ' ' })
    expect(r.ok).toBe(false)
    expect(write.update).not.toHaveBeenCalled()
  })

  it('rejects with a reason', async () => {
    expect(await rejectCandidate({ ...ids, reason: 'Skills do not match the role' })).toEqual({ ok: true })
  })

  it('rejects an interview slot in the past or beyond 60 days', async () => {
    portal.getPortalCandidate.mockResolvedValue(candidate('shortlisted', ['propose_interview', 'reject']))
    const past = await proposeInterview({ ...ids, slot: '2020-01-01T10:00:00+05:30' })
    const far = await proposeInterview({ ...ids, slot: new Date(Date.now() + 90 * 86_400_000).toISOString() })
    expect(past.ok).toBe(false)
    expect(far.ok).toBe(false)
    expect(write.update).not.toHaveBeenCalled()
  })

  it('accepts a near-future slot for a shortlisted candidate', async () => {
    portal.getPortalCandidate.mockResolvedValue(candidate('shortlisted', ['propose_interview', 'reject']))
    const r = await proposeInterview({ ...ids, slot: new Date(Date.now() + 3 * 86_400_000).toISOString() })
    expect(r).toEqual({ ok: true })
  })
})
