'use server'

import { and, eq } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { can, canRecruiterMove, transition, type PipelineStage } from '@shortlist/core'
import { db } from '@/db'
import { auditLog, pipelineEntries } from '@/db/schema'
import { requireStaff } from '@/lib/session'

export type PipelineResult = { ok: true } | { ok: false; error: string }

const Input = z.object({
  requisitionId: z.string().min(1),
  candidateId: z.string().min(1),
  to: z.enum(['offered', 'joined', 'rejected']),
  reason: z.string().trim().max(500).optional(),
})

/**
 * A recruiter's manual pipeline moves: interview -> offered -> joined, or reject.
 * Earlier moves belong to the Submit button and to the client (see recruiter-stages.ts).
 * Rejecting needs a reason, which stays internal: a recruiter-side rejection is
 * never shown to a client (ASSUMPTION A7).
 */
export async function advanceStage(input: unknown): Promise<PipelineResult> {
  const { user } = await requireStaff()
  const parsed = Input.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid request.' }
  const { requisitionId, candidateId, to, reason } = parsed.data
  if (!can(user, 'candidate:write', { type: 'candidate' })) return { ok: false, error: 'Not allowed.' }
  if (to === 'rejected' && (!reason || reason.length < 3)) return { ok: false, error: 'Please give a short reason.' }

  const where = and(eq(pipelineEntries.candidateId, candidateId), eq(pipelineEntries.requisitionId, requisitionId))
  const [entry] = await db.select({ stage: pipelineEntries.stage }).from(pipelineEntries).where(where).limit(1)
  if (!entry) return { ok: false, error: 'Candidate is not in this requisition.' }

  const from = entry.stage as PipelineStage
  if (!canRecruiterMove(from, to)) return { ok: false, error: `A candidate in ${from} cannot be moved to ${to} here.` }
  const move = transition(from, to)
  if (!move.ok) return { ok: false, error: move.error ?? 'Invalid move.' }

  const now = new Date()
  await db
    .update(pipelineEntries)
    .set({ stage: to, rejectionReason: to === 'rejected' ? (reason ?? null) : null, updatedByUserId: user.id, updatedAt: now })
    .where(where)
  await db.insert(auditLog).values({
    id: createId(),
    userId: user.id,
    candidateId,
    requisitionId,
    action: `stage_${to}`,
    metadata: { from, to },
  })

  revalidatePath(`/recruiter/requisitions/${requisitionId}`)
  revalidatePath(`/recruiter/requisitions/${requisitionId}/pipeline`)
  return { ok: true }
}
