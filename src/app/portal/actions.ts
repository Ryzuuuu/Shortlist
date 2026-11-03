'use server'

import { and, eq, isNull } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { can, transition, type ClientAction, type PipelineStage } from '@shortlist/core'
import { db } from '@/db'
import { auditLog, clientFeedback, pipelineEntries, submissions } from '@/db/schema'
import { getPortalCandidate, getPortalRequisition } from '@/lib/queries/portal'
import { requireClient } from '@/lib/session'

export type PortalResult = { ok: true } | { ok: false; error: string }

const Ids = z.object({ requisitionId: z.string().min(1), candidateId: z.string().min(1) })

const TARGET: Record<ClientAction, PipelineStage> = {
  shortlist: 'shortlisted',
  reject: 'rejected',
  propose_interview: 'interview',
}

/**
 * Shared path for all client feedback. Order matters: authenticate, check the
 * requisition belongs to this client's organisation, run the single policy
 * function, then check the action is valid for the candidate's current stage.
 * Only then is anything written.
 */
async function applyFeedback(
  input: unknown,
  action: ClientAction,
  extra: { reason?: string; proposedSlot?: string },
): Promise<PortalResult> {
  const { user } = await requireClient()
  const ids = Ids.safeParse(input)
  if (!ids.success) return { ok: false, error: 'Invalid request.' }
  const { requisitionId, candidateId } = ids.data

  const requisition = await getPortalRequisition(requisitionId, user.clientId)
  if (!requisition || !can(user, 'submission:feedback', { type: 'submission', owningClientId: requisition.clientId })) {
    return { ok: false, error: 'Not found.' }
  }

  const candidate = await getPortalCandidate(requisitionId, candidateId, user.clientId)
  if (!candidate) return { ok: false, error: 'Not found.' }
  if (!candidate.actions.includes(action)) return { ok: false, error: 'That action is not available at this stage.' }

  const move = transition(candidate.stage, TARGET[action])
  if (!move.ok) return { ok: false, error: move.error ?? 'Cannot change stage.' }

  const now = new Date()
  await db
    .update(pipelineEntries)
    .set({
      stage: TARGET[action],
      rejectionReason: action === 'reject' ? (extra.reason ?? null) : null,
      updatedByUserId: user.id,
      updatedAt: now,
    })
    .where(and(eq(pipelineEntries.candidateId, candidateId), eq(pipelineEntries.requisitionId, requisitionId)))
  await db.insert(clientFeedback).values({
    id: createId(),
    submissionId: candidate.submissionId,
    userId: user.id,
    action,
    reason: extra.reason ?? null,
    proposedSlot: extra.proposedSlot ?? null,
  })
  await db.insert(auditLog).values({
    id: createId(),
    userId: user.id,
    candidateId,
    requisitionId,
    action: `client_${action}`,
  })

  revalidatePath(`/portal/requisitions/${requisitionId}`)
  return { ok: true }
}

/** Logged when a client opens a candidate: who viewed what, and when (DPDP audit). */
export async function recordClientView(input: unknown): Promise<PortalResult> {
  const { user } = await requireClient()
  const ids = Ids.safeParse(input)
  if (!ids.success) return { ok: false, error: 'Invalid request.' }
  const { requisitionId, candidateId } = ids.data

  const candidate = await getPortalCandidate(requisitionId, candidateId, user.clientId)
  if (!candidate) return { ok: false, error: 'Not found.' }

  await db
    .update(submissions)
    .set({ viewedByClientAt: new Date() })
    .where(and(eq(submissions.id, candidate.submissionId), isNull(submissions.viewedByClientAt)))
  await db.insert(auditLog).values({ id: createId(), userId: user.id, candidateId, requisitionId, action: 'client_viewed' })
  return { ok: true }
}

export async function shortlistCandidate(input: unknown) {
  return applyFeedback(input, 'shortlist', {})
}

const RejectSchema = Ids.extend({
  reason: z.string().trim().min(3, 'Please give a short reason.').max(500),
})

export async function rejectCandidate(input: unknown) {
  const parsed = RejectSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid request.' } as const
  return applyFeedback(parsed.data, 'reject', { reason: parsed.data.reason })
}

const MAX_DAYS_AHEAD = 60

const SlotSchema = Ids.extend({ slot: z.string().min(1, 'Choose a date and time.') })

export async function proposeInterview(input: unknown) {
  const parsed = SlotSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid request.' } as const
  const when = new Date(parsed.data.slot)
  if (Number.isNaN(when.getTime())) return { ok: false, error: 'That date and time is not valid.' } as const
  if (when.getTime() <= Date.now()) return { ok: false, error: 'Choose a time in the future.' } as const
  if (when.getTime() > Date.now() + MAX_DAYS_AHEAD * 86_400_000) {
    return { ok: false, error: `Choose a time within ${MAX_DAYS_AHEAD} days.` } as const
  }
  return applyFeedback(parsed.data, 'propose_interview', { proposedSlot: when.toISOString() })
}
