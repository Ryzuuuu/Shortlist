// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  session: null as null | { user: { id: string; role: string; clientId?: string | null } },
  selects: [] as unknown[][],
  insert: vi.fn(),
  update: vi.fn(),
  putFile: vi.fn(),
  processCvFile: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  getSession: async () => m.session,
  toPolicyUser: (u?: { id: string; role: string; clientId?: string | null }) => (u ? { id: u.id, role: u.role, clientId: u.clientId ?? null } : null),
}))
vi.mock('@/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve(m.selects.shift() ?? []) }) }) }),
    insert: () => ({ values: (v: unknown) => (m.insert(v), Promise.resolve()) }),
    update: () => ({ set: (v: unknown) => ({ where: () => (m.update(v), Promise.resolve()) }) }),
  },
}))
vi.mock('@/db/schema', () => ({ cvFiles: {}, requisitions: {} }))
vi.mock('drizzle-orm', () => ({ and: () => ({}), eq: () => ({}), desc: () => ({}) }))
vi.mock('@/lib/ingestion/storage', () => ({ putFile: m.putFile }))
vi.mock('@/lib/ingestion/process', () => ({ processCvFile: m.processCvFile }))

import { POST } from './route'

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a])
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03])

function upload(file: File | null, requisitionId: string | null = 'req-1') {
  const body = new FormData()
  if (file) body.set('file', file)
  if (requisitionId) body.set('requisitionId', requisitionId)
  return new Request('http://localhost/api/upload', { method: 'POST', body })
}
const pdf = (name = 'cv.pdf', bytes: Uint8Array = PDF) => new File([bytes as BlobPart], name, { type: 'application/pdf' })

beforeEach(() => {
  vi.clearAllMocks()
  m.session = { user: { id: 'rec-1', role: 'recruiter' } }
  m.selects = [[{ id: 'req-1' }], []] // requisition exists, no existing file with this hash
  m.putFile.mockResolvedValue('local:file-1')
  m.processCvFile.mockResolvedValue('scored')
})

describe('POST /api/upload: authorisation', () => {
  it('401 when signed out', async () => {
    m.session = null
    expect((await POST(upload(pdf()))).status).toBe(401)
    expect(m.putFile).not.toHaveBeenCalled()
  })

  it('403 for a client user, and nothing is stored', async () => {
    m.session = { user: { id: 'c', role: 'client', clientId: 'A' } }
    expect((await POST(upload(pdf()))).status).toBe(403)
    expect(m.putFile).not.toHaveBeenCalled()
  })
})

describe('POST /api/upload: validation', () => {
  it('400 when the body is not multipart form data', async () => {
    const res = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }))
    expect(res.status).toBe(400)
  })

  it('400 when the file or requisition is missing', async () => {
    expect((await POST(upload(null))).status).toBe(400)
    expect((await POST(upload(pdf(), null))).status).toBe(400)
  })

  it('413 for a file over 4 MB', async () => {
    const big = new Uint8Array(4 * 1024 * 1024 + 1)
    big.set(PDF)
    const res = await POST(upload(pdf('big.pdf', big)))
    expect(res.status).toBe(413)
    expect((await res.json()).reason).toBe('file_too_large')
    expect(m.putFile).not.toHaveBeenCalled()
  })

  it('400 for an empty file', async () => {
    const res = await POST(upload(pdf('empty.pdf', new Uint8Array(0))))
    expect(res.status).toBe(400)
    expect((await res.json()).reason).toBe('empty_file')
  })

  it('400 for an unsupported type', async () => {
    const res = await POST(upload(new File([EXE as BlobPart], 'cv.exe', { type: 'application/x-msdownload' })))
    expect(res.status).toBe(400)
    expect((await res.json()).reason).toBe('unsupported_type')
  })

  it('400 for an executable renamed to .pdf', async () => {
    const res = await POST(upload(pdf('cv.pdf', EXE)))
    expect(res.status).toBe(400)
    expect((await res.json()).reason).toBe('content_mismatch')
    expect(m.putFile).not.toHaveBeenCalled()
  })

  it('404 for an unknown requisition', async () => {
    m.selects = [[]]
    expect((await POST(upload(pdf()))).status).toBe(404)
    expect(m.putFile).not.toHaveBeenCalled()
  })
})

describe('POST /api/upload: accepted files', () => {
  it('stores, records and processes a valid PDF', async () => {
    const res = await POST(upload(pdf()))
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ status: 'scored' })
    expect(m.putFile).toHaveBeenCalledTimes(1)
    expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ requisitionId: 'req-1', uploadedByUserId: 'rec-1', status: 'pending' }))
    expect(m.processCvFile).toHaveBeenCalledTimes(1)
  })

  it('is idempotent: the same bytes sent again are not stored or processed twice', async () => {
    m.selects = [[{ id: 'req-1' }], [{ id: 'file-9', status: 'scored' }]]
    const res = await POST(upload(pdf()))
    expect(await res.json()).toEqual({ id: 'file-9', status: 'scored', duplicate: true })
    expect(m.putFile).not.toHaveBeenCalled()
    expect(m.processCvFile).not.toHaveBeenCalled()
  })

  it('re-processes a file abandoned mid-processing, but not one that is still being processed', async () => {
    const old = new Date(Date.now() - 10 * 60 * 1000)
    m.selects = [[{ id: 'req-1' }], [{ id: 'file-9', status: 'parsing', updatedAt: old }]]
    const res = await POST(upload(pdf()))
    expect(res.status).toBe(201)
    expect(m.processCvFile).toHaveBeenCalledWith('file-9')

    vi.clearAllMocks()
    m.putFile.mockResolvedValue('local:file-1')
    m.processCvFile.mockResolvedValue('scored')
    m.selects = [[{ id: 'req-1' }], [{ id: 'file-9', status: 'parsing', updatedAt: new Date() }]]
    const busy = await POST(upload(pdf()))
    expect(await busy.json()).toMatchObject({ id: 'file-9', duplicate: true })
    expect(m.processCvFile).not.toHaveBeenCalled()
  })

  it('re-processes a previously failed file instead of ignoring it', async () => {
    m.selects = [[{ id: 'req-1' }], [{ id: 'file-9', status: 'failed' }]]
    const res = await POST(upload(pdf()))
    expect(res.status).toBe(201)
    expect(m.insert).not.toHaveBeenCalled()
    expect(m.update).toHaveBeenCalled()
    expect(m.processCvFile).toHaveBeenCalledWith('file-9')
  })
})
