/**
 * POST /api/upload  — ONE CV per request (multipart: file, requisitionId).
 * GET  /api/upload?requisitionId=…  — per-file status, so the UI can resume.
 *
 * The client dispatches up to 4 of these concurrently (ASSUMPTION A3); there is
 * deliberately no 500-file endpoint.
 */
import { and, desc, eq } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { can, validateUpload } from '@shortlist/core'
import { db } from '@/db'
import { cvFiles, requisitions } from '@/db/schema'
import { getSession, toPolicyUser } from '@/lib/auth'
import { isStaleProcessing } from '@/lib/ingestion/constants'
import { computeHash } from '@/lib/ingestion/parse'
import { processCvFile } from '@/lib/ingestion/process'
import { putFile } from '@/lib/ingestion/storage'

export const maxDuration = 60

export async function POST(request: Request) {
  const session = await getSession(request.headers)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!can(toPolicyUser(session.user), 'upload:create', { type: 'upload' })) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return Response.json({ error: 'Expected multipart form data' }, { status: 400 })
  }

  const file = form.get('file')
  const requisitionId = form.get('requisitionId')
  if (!(file instanceof File) || typeof requisitionId !== 'string' || !requisitionId) {
    return Response.json({ error: 'file and requisitionId are required' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const check = validateUpload({
    filename: file.name,
    declaredMime: file.type,
    sizeBytes: buffer.length,
    head: buffer.subarray(0, 8),
  })
  if (!check.ok) {
    const status = check.reason === 'file_too_large' ? 413 : 400
    return Response.json({ error: check.message, reason: check.reason }, { status })
  }

  const [req] = await db
    .select({ id: requisitions.id })
    .from(requisitions)
    .where(eq(requisitions.id, requisitionId))
    .limit(1)
  if (!req) return Response.json({ error: 'Requisition not found' }, { status: 404 })

  // Idempotent: re-sending the same bytes to the same requisition resumes, not duplicates.
  const contentHash = computeHash(buffer)
  const [existing] = await db
    .select()
    .from(cvFiles)
    .where(and(eq(cvFiles.requisitionId, requisitionId), eq(cvFiles.contentHash, contentHash)))
    .limit(1)
  // A failed file, or one abandoned mid-processing, is processed again; anything else is already handled.
  if (existing && existing.status !== 'failed' && !isStaleProcessing(existing.status, existing.updatedAt)) {
    return Response.json({ id: existing.id, status: existing.status, duplicate: true })
  }

  const id = existing?.id ?? createId()
  const storageUrl = await putFile(id, file.name, buffer)
  if (!existing) {
    await db.insert(cvFiles).values({
      id,
      requisitionId,
      uploadedByUserId: session.user.id,
      storageUrl,
      originalFilename: file.name,
      mimeType: check.mimeType,
      sizeBytes: buffer.length,
      contentHash,
      status: 'pending',
    })
  } else {
    await db.update(cvFiles).set({ storageUrl, status: 'pending', errorMessage: null }).where(eq(cvFiles.id, id))
  }

  const outcome = await processCvFile(id)
  return Response.json({ id, status: outcome }, { status: 201 })
}

export async function GET(request: Request) {
  const session = await getSession(request.headers)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!can(toPolicyUser(session.user), 'upload:create', { type: 'upload' })) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const requisitionId = new URL(request.url).searchParams.get('requisitionId')
  if (!requisitionId) return Response.json({ error: 'requisitionId is required' }, { status: 400 })

  const rows = await db
    .select({
      id: cvFiles.id,
      filename: cvFiles.originalFilename,
      status: cvFiles.status,
      errorMessage: cvFiles.errorMessage,
      isScanned: cvFiles.isScanned,
      candidateId: cvFiles.candidateId,
    })
    .from(cvFiles)
    .where(eq(cvFiles.requisitionId, requisitionId))
    .orderBy(desc(cvFiles.createdAt))
  return Response.json({ files: rows })
}
