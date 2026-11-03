/**
 * POST /api/upload/retry  { fileId }  — re-run processing for a failed or
 * needs_review file from its stored bytes. Nothing is ever silently dropped (A11).
 */
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { can } from '@shortlist/core'
import { db } from '@/db'
import { cvFiles } from '@/db/schema'
import { getSession, toPolicyUser } from '@/lib/auth'
import { processCvFile } from '@/lib/ingestion/process'

export const maxDuration = 60

const Body = z.object({ fileId: z.string().min(1) })

export async function POST(request: Request) {
  const session = await getSession(request.headers)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!can(toPolicyUser(session.user), 'candidate:retry_upload', { type: 'upload' })) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'fileId is required' }, { status: 400 })

  const [file] = await db.select().from(cvFiles).where(eq(cvFiles.id, parsed.data.fileId)).limit(1)
  if (!file) return Response.json({ error: 'File not found' }, { status: 404 })
  if (file.status === 'scored' || file.status === 'parsing') {
    return Response.json({ error: `Cannot retry a file that is ${file.status}` }, { status: 409 })
  }

  const status = await processCvFile(file.id)
  return Response.json({ id: file.id, status })
}
