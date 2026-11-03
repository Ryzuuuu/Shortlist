'use server'

import { and, eq, isNull } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { can, transition, type PipelineStage } from '@shortlist/core'
import { db } from '@/db'
import { auditLog, pipelineEntries, submissions } from '@/db/schema'
import { requireStaff } from '@/lib/session'

const Ids = z.object({ requisitionId: z.string().min(1), candidateId: z.string().min(1) })

export type ActionResult = { ok: true } | { ok: false; error: string }

const pipelineWhere = (requisitionId: string, candidateId: string) =>
  and(eq(pipelineEntries.candidateId, candidateId), eq(pipelineEntries.requisitionId, requisitionId))

/**
 * Called when the recruiter opens the CV. Records viewedByRecruiterAt (the gate
 * for Submit) and an audit entry. Idempotent: the first view time is kept.
 */
export async function recordCvView(input: unknown): Promise<ActionResult> {
  const { user } = await requireStaff()
  const ids = Ids.safeParse(input)
  if (!ids.success) return { ok: false, error: 'Invalid request.' }
  const { requisitionId, candidateId } = ids.data
  if (!can(user, 'candidate:view_cv', { type: 'candidate' })) return { ok: false, error: 'Not allowed.' }

  const now = new Date()
  // A submissions row exists from first view; the pipeline stage, not this row,
  // decides whether a client can see the candidate (ASSUMPTION A7).
  await db
    .insert(submissions)
    .values({ id: createId(), candidateId, requisitionId, submittedByUserId: user.id, viewedByRecruiterAt: now })
    .onConflictDoNothing()
  await db
    .update(submissions)
    .set({ viewedByRecruiterAt: now, updatedAt: now })
    .where(
      and(eq(submissions.candidateId, candidateId), eq(submissions.requisitionId, requisitionId), isNull(submissions.viewedByRecruiterAt)),
    )

  await db
    .update(pipelineEntries)
    .set({ stage: 'screened', updatedByUserId: user.id, updatedAt: now })
    .where(and(pipelineWhere(requisitionId, candidateId), eq(pipelineEntries.stage, 'sourced')))

  await db.insert(auditLog).values({
    id: createId(),
    userId: user.id,
    candidateId,
    requisitionId,
    action: 'candidate_viewed',
  })
  return { ok: true }
}

const SubmitSchema = Ids.extend({ note: z.string().trim().max(1000).optional() })

/** Submit a candidate to the client. Refused unless the recruiter has opened the CV. */
export async function submitCandidate(input: unknown): Promise<ActionResult> {
  const { user } = await requireStaff()
  const parsed = SubmitSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid request.' }
  const { requisitionId, candidateId, note } = parsed.data
  if (!can(user, 'candidate:submit', { type: 'candidate' })) return { ok: false, error: 'Not allowed.' }

  const [sub] = await db
    .select({ viewedAt: submissions.viewedByRecruiterAt })
    .from(submissions)
    .where(and(eq(submissions.candidateId, candidateId), eq(submissions.requisitionId, requisitionId)))
    .limit(1)
  if (!sub?.viewedAt) return { ok: false, error: 'Open the CV before submitting it.' }

  const [entry] = await db.select({ stage: pipelineEntries.stage }).from(pipelineEntries).where(pipelineWhere(requisitionId, candidateId)).limit(1)
  if (!entry) return { ok: false, error: 'Candidate is not in this requisition.' }
  const move = transition(entry.stage as PipelineStage, 'submitted')
  if (!move.ok) return { ok: false, error: move.error ?? 'Cannot submit from this stage.' }

  const now = new Date()
  await db.update(pipelineEntries).set({ stage: 'submitted', updatedByUserId: user.id, updatedAt: now }).where(pipelineWhere(requisitionId, candidateId))
  await db
    .update(submissions)
    .set({ recruiterNote: note || null, submittedByUserId: user.id, updatedAt: now })
    .where(and(eq(submissions.candidateId, candidateId), eq(submissions.requisitionId, requisitionId)))
  await db.insert(auditLog).values({ id: createId(), userId: user.id, candidateId, requisitionId, action: 'candidate_submitted' })

  revalidatePath(`/recruiter/requisitions/${requisitionId}`)
  return { ok: true }
}
