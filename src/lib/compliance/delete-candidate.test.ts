import { beforeEach, describe, expect, it, vi } from 'vitest'

const log = vi.hoisted(() => ({ calls: [] as string[], candidate: true, files: [] as Array<{ storageUrl: string | null; contentHash: string }>, deleteFileFails: false, audit: [] as unknown[] }))

vi.mock('@/lib/ingestion/storage', () => ({
  deleteFile: async (key: string) => {
    if (log.deleteFileFails) throw new Error('storage down')
    log.calls.push(`file:${key}`)
  },
}))

vi.mock('@/db', () => {
  // select().from(table).where().limit()  -> candidate row; select().from().where() -> files
  const select = () => ({
    from: (t: { _name?: string }) => ({
      where: () => {
        const rows = t._name === 'candidates' ? (log.candidate ? [{ contentHash: 'h-cand' }] : []) : log.files
        return Object.assign(Promise.resolve(rows), { limit: () => Promise.resolve(rows) })
      },
    }),
  })
  return {
    db: {
      select,
      delete: (t: { _name?: string }) => ({ where: () => (log.calls.push(`delete:${t._name}`), Promise.resolve()) }),
      update: (t: { _name?: string }) => ({
        set: (v: unknown) => ({ where: () => (log.calls.push(`update:${t._name}`), log.audit.push(v), Promise.resolve()) }),
      }),
      insert: (t: { _name?: string }) => ({
        values: (v: unknown) => ({ onConflictDoNothing: () => (log.calls.push(`insert:${t._name}`), log.audit.push(v), Promise.resolve()) }),
      }),
    },
  }
})
vi.mock('@/db/schema', () => ({
  candidates: { _name: 'candidates', id: 'id', contentHash: 'contentHash' },
  cvFiles: { _name: 'cv_files', candidateId: 'candidateId', storageUrl: 's', contentHash: 'h' },
  aiReviewSamples: { _name: 'ai_review_samples', contentHash: 'h' },
  auditLog: { _name: 'audit_log', candidateId: 'candidateId' },
}))
vi.mock('drizzle-orm', () => ({ eq: () => ({}), inArray: () => ({}) }))

import { deleteCandidateData } from './delete-candidate'

beforeEach(() => {
  log.calls = []
  log.audit = []
  log.candidate = true
  log.deleteFileFails = false
  log.files = [{ storageUrl: 'local:f1', contentHash: 'h-f1' }, { storageUrl: null, contentHash: 'h-f2' }]
  process.env.AUDIT_HASH_KEY = 'test-key'
})

describe('deleteCandidateData', () => {
  it('removes files and cache, anonymises audit, and deletes the candidate row last', async () => {
    expect(await deleteCandidateData('cand-1', 'staff-1')).toEqual({ ok: true })
    expect(log.calls).toEqual([
      'file:local:f1',
      'delete:ai_review_samples',
      'update:audit_log',
      'insert:audit_log',
      'delete:candidates',
    ])
  })

  it('stores only an anonymised id in the audit trail, never the raw candidate id', async () => {
    await deleteCandidateData('cand-1', 'staff-1')
    expect(JSON.stringify(log.audit)).not.toContain('cand-1')
    const stub = log.audit.find((a) => (a as { action?: string }).action === 'candidate_deleted') as { candidateId: string; userId: string }
    expect(stub.candidateId.startsWith('anon:')).toBe(true)
    expect(stub.userId).toBe('staff-1')
  })

  it('aborts with the database untouched if a stored file cannot be deleted', async () => {
    log.deleteFileFails = true
    const r = await deleteCandidateData('cand-1', 'staff-1')
    expect(r.ok).toBe(false)
    expect(log.calls).toEqual([])
  })

  it('reports an unknown candidate without writing anything', async () => {
    log.candidate = false
    expect(await deleteCandidateData('nope', 'staff-1')).toEqual({ ok: false, error: 'Candidate not found.' })
    expect(log.calls).toEqual([])
  })

  it('refuses to run without a hashing key', async () => {
    delete process.env.AUDIT_HASH_KEY
    delete process.env.BETTER_AUTH_SECRET
    await expect(deleteCandidateData('cand-1', 'staff-1')).rejects.toThrow(/AUDIT_HASH_KEY/)
  })
})
