/**
 * src/lib/queries/portal.ts
 *
 * Client-portal read models. EVERY function takes the caller's clientId and
 * filters on it in SQL, so a client can never load another client's data even
 * if a page forgets a check. Contacts are masked here, not in the UI (A1), and
 * the raw CV text is never returned to clients.
 */
import { and, desc, eq, inArray } from 'drizzle-orm'
import { contactsVisible, isVisibleToClient, maskContactDetails, type ClientAction, allowedClientActions } from '@shortlist/core'
import type { PipelineStage } from '@shortlist/core'
import { db } from '@/db'
import { candidates, clientFeedback, pipelineEntries, requisitions, scorecards, scores, submissions } from '@/db/schema'
import type { CandidateProfile, ScorecardCriterion } from '@/db/types'
import type { CriterionResult } from '@/lib/queries/recruiter'

export async function listPortalRequisitions(clientId: string) {
  const reqs = await db
    .select({ id: requisitions.id, title: requisitions.title, createdAt: requisitions.createdAt })
    .from(requisitions)
    .where(and(eq(requisitions.clientId, clientId), eq(requisitions.isOpen, true)))
    .orderBy(desc(requisitions.createdAt))
  if (reqs.length === 0) return []

  const entries = await db
    .select({ requisitionId: pipelineEntries.requisitionId, stage: pipelineEntries.stage })
    .from(pipelineEntries)
    .where(inArray(pipelineEntries.requisitionId, reqs.map((r) => r.id)))

  return reqs.map((r) => {
    const mine = entries.filter((e) => e.requisitionId === r.id)
    return {
      ...r,
      awaitingReview: mine.filter((e) => e.stage === 'submitted').length,
      shortlisted: mine.filter((e) => e.stage === 'shortlisted' || e.stage === 'interview').length,
    }
  })
}

/** The requisition, only if it belongs to this client. */
export async function getPortalRequisition(id: string, clientId: string) {
  const [row] = await db
    .select({ id: requisitions.id, title: requisitions.title, clientId: requisitions.clientId })
    .from(requisitions)
    .where(and(eq(requisitions.id, id), eq(requisitions.clientId, clientId)))
    .limit(1)
  return row ?? null
}

export interface ClientCandidateView {
  candidateId: string
  submissionId: string
  name: string
  headline: string
  location: string | null
  skills: string[]
  /** Stated or computed from the CV; null when unknown. Expected CTC is deliberately not shared with clients. */
  experienceYears: number | null
  noticeDays: number | null
  stage: PipelineStage
  total: number
  recruiterNote: string | null
  evidence: Array<{ criterionId: string; label: string; met: CriterionResult['effectiveMet']; quote: string | null }>
  /** null until the candidate is shortlisted */
  contacts: { email: string | null; phone: string | null } | null
  actions: ClientAction[]
  rejectionReason: string | null
  proposedSlot: string | null
}

/** Candidates the recruiter has submitted to this client's requisition, best first. */
export async function getPortalCandidates(requisitionId: string, clientId: string): Promise<ClientCandidateView[]> {
  const owned = await getPortalRequisition(requisitionId, clientId)
  if (!owned) return []

  const [rows, [card]] = await Promise.all([
    db
      .select({
        candidateId: scores.candidateId,
        total: scores.total,
        perCriterion: scores.perCriterion,
        profile: candidates.profile,
        stage: pipelineEntries.stage,
        submissionId: submissions.id,
        note: submissions.recruiterNote,
      })
      .from(scores)
      .innerJoin(candidates, eq(candidates.id, scores.candidateId))
      .innerJoin(
        pipelineEntries,
        and(eq(pipelineEntries.candidateId, scores.candidateId), eq(pipelineEntries.requisitionId, scores.requisitionId)),
      )
      .innerJoin(
        submissions,
        and(eq(submissions.candidateId, scores.candidateId), eq(submissions.requisitionId, scores.requisitionId)),
      )
      .where(eq(scores.requisitionId, requisitionId))
      .orderBy(desc(scores.total)),
    db.select({ criteria: scorecards.criteria }).from(scorecards).where(eq(scorecards.requisitionId, requisitionId)).orderBy(desc(scorecards.version)).limit(1),
  ])

  const labels = new Map((card?.criteria as ScorecardCriterion[] | undefined)?.map((c) => [c.id, c.label]))
  const feedback = rows.length
    ? await db
        .select()
        .from(clientFeedback)
        .where(inArray(clientFeedback.submissionId, rows.map((r) => r.submissionId)))
        .orderBy(desc(clientFeedback.createdAt))
    : []

  const out: ClientCandidateView[] = []
  for (const r of rows) {
    const stage = r.stage as PipelineStage
    const mine = feedback.filter((f) => f.submissionId === r.submissionId)
    const reject = mine.find((f) => f.action === 'reject')
    if (!isVisibleToClient(stage, reject != null)) continue

    const p = r.profile as CandidateProfile
    out.push({
      candidateId: r.candidateId,
      submissionId: r.submissionId,
      name: `${p.firstName} ${p.lastName}`.trim() || 'Candidate',
      headline: p.headline || p.currentRole || '',
      location: p.location,
      skills: p.skills,
      experienceYears: p.experienceYears ?? null,
      noticeDays: p.noticeDays ?? null,
      stage,
      total: r.total,
      recruiterNote: r.note,
      evidence: (r.perCriterion as CriterionResult[]).map((c) => ({
        criterionId: c.criterionId,
        label: labels.get(c.criterionId) ?? 'Criterion',
        met: c.effectiveMet,
        quote: c.quote ? maskContactDetails(c.quote) : null,
      })),
      contacts: contactsVisible(stage) ? { email: p.email, phone: p.phone } : null,
      actions: allowedClientActions(stage),
      rejectionReason: reject?.reason ?? null,
      proposedSlot: mine.find((f) => f.action === 'propose_interview')?.proposedSlot ?? null,
    })
  }
  return out
}

export async function getPortalCandidate(requisitionId: string, candidateId: string, clientId: string) {
  return (await getPortalCandidates(requisitionId, clientId)).find((c) => c.candidateId === candidateId) ?? null
}
