import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  session: null as null | { user: { id: string; role: string; clientId?: string | null } },
  getWeeklyAgreement: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  getSession: async () => mocks.session,
  toPolicyUser: (u: { id: string; role: string; clientId?: string | null } | undefined) => (u ? { id: u.id, role: u.role, clientId: u.clientId ?? null } : null),
}))
vi.mock('@/lib/queries/agreement', () => ({ getWeeklyAgreement: mocks.getWeeklyAgreement }))

import { GET } from './route'
import { buildAgreementCsv } from '@/lib/reports/agreement-csv'

const req = (q = '') => new Request(`http://localhost/api/delivery/agreement${q}`)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.session = null
  mocks.getWeeklyAgreement.mockResolvedValue({ rows: [], submitted: 0, agreed: 0, agreementPct: null })
})

describe('GET /api/delivery/agreement', () => {
  it('rejects anonymous callers with 401 and reads no data', async () => {
    expect((await GET(req())).status).toBe(401)
    expect(mocks.getWeeklyAgreement).not.toHaveBeenCalled()
  })

  it.each(['recruiter', 'client'])('rejects a %s with 403 and reads no data', async (role) => {
    mocks.session = { user: { id: 'u', role, clientId: role === 'client' ? 'A' : null } }
    expect((await GET(req())).status).toBe(403)
    expect(mocks.getWeeklyAgreement).not.toHaveBeenCalled()
  })

  it('serves a CSV download to the delivery head, and clamps a silly week value', async () => {
    mocks.session = { user: { id: 'd', role: 'delivery_head' } }
    const res = await GET(req('?week=99999'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toContain('attachment')
    expect((await res.text()).split('\r\n')[0]).toContain('requisition')
  })
})

describe('buildAgreementCsv', () => {
  it('labels agreeing, disagreeing and not-submitted rows, and neutralises formula names', () => {
    const csv = buildAgreementCsv(
      {
        submitted: 2,
        agreed: 1,
        agreementPct: 50,
        rows: [
          {
            requisitionId: 'r',
            title: 'Java Dev',
            clientName: 'Acme',
            names: { a: 'Asha Rao', e: '=cmd()', b: 'Bo Li' },
            submittedIds: ['a', 'e'],
            result: {
              submittedCount: 2,
              agreedCount: 1,
              agreementPct: 50,
              scoredCount: 3,
              submitted: [{ candidateId: 'a', total: 90, rank: 1 }, { candidateId: 'e', total: 20, rank: 3 }],
              disagreements: [{ candidateId: 'e', total: 20, rank: 3 }],
              notSubmittedInTopN: [{ candidateId: 'b', total: 80, rank: 2 }],
            },
          },
        ],
      },
      new Date('2026-11-01T18:30:00Z'),
    )
    const lines = csv.trim().split('\r\n')
    expect(lines).toHaveLength(4)
    expect(lines[1]).toBe('2026-11-02,Java Dev,Acme,Asha Rao,1,90,submitted_agrees,50')
    expect(lines[2]).toBe("2026-11-02,Java Dev,Acme,'=cmd(),3,20,submitted_disagrees,50")
    expect(lines[3]).toContain('not_submitted_in_ai_top_n')
  })
})
