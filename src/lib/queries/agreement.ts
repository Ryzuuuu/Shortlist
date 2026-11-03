/**
 * src/lib/queries/agreement.ts
 *
 * Weekly AI-rank vs recruiter-choice data for the delivery head (A10).
 * The caller must already have passed can(user, 'insights:read').
 *
 * "This week" means submissions whose submissions.updatedAt falls in the IST
 * week. After a recruiter submits, nothing else touches that column, so it is
 * the submit time (ASSUMPTION A10).
 */
import { and, desc, eq, gte, inArray, lt } from 'drizzle-orm'
import { compareRanks, isVisibleToClient, type AgreementResult, type PipelineStage } from '@shortlist/core'
import { db } from '@/db'
import { candidates, clientFeedback, clients, pipelineEntries, requisitions, scores, submissions } from '@/db/schema'
import type { CandidateProfile } from '@/db/types'

export interface RequisitionAgreement {
  requisitionId: string
  title: string
  clientName: string
  result: AgreementResult
  /** candidateId -> display name, for everyone in `result` */
  names: Record<string, string>
  submittedIds: string[]
}

export interface WeeklyAgreement {
  rows: RequisitionAgreement[]
  submitted: number
  agreed: number
  agreementPct: number | null
}

export async function getWeeklyAgreement(start: Date, end: Date): Promise<WeeklyAgreement> {
  const subs = await db
    .select({
      id: submissions.id,
      candidateId: submissions.candidateId,
      requisitionId: submissions.requisitionId,
      stage: pipelineEntries.stage,
    })
    .from(submissions)
    .innerJoin(
      pipelineEntries,
      and(eq(pipelineEntries.candidateId, submissions.candidateId), eq(pipelineEntries.requisitionId, submissions.requisitionId)),
    )
    .where(and(gte(submissions.updatedAt, start), lt(submissions.updatedAt, end)))

  const withFeedback = subs.length
    ? new Set((await db.select({ id: clientFeedback.submissionId }).from(clientFeedback).where(inArray(clientFeedback.submissionId, subs.map((s) => s.id)))).map((f) => f.id))
    : new Set<string>()

  // Genuinely submitted: visible to a client, or rejected by one after submission.
  const real = subs.filter((s) => isVisibleToClient(s.stage as PipelineStage, withFeedback.has(s.id)))
  const reqIds = [...new Set(real.map((s) => s.requisitionId))]
  if (reqIds.length === 0) return { rows: [], submitted: 0, agreed: 0, agreementPct: null }

  const [reqs, scored] = await Promise.all([
    db
      .select({ id: requisitions.id, title: requisitions.title, clientName: clients.name })
      .from(requisitions)
      .innerJoin(clients, eq(clients.id, requisitions.clientId))
      .where(inArray(requisitions.id, reqIds)),
    db
      .select({ requisitionId: scores.requisitionId, candidateId: scores.candidateId, total: scores.total, profile: candidates.profile })
      .from(scores)
      .innerJoin(candidates, eq(candidates.id, scores.candidateId))
      .where(inArray(scores.requisitionId, reqIds))
      .orderBy(desc(scores.createdAt)),
  ])

  const rows: RequisitionAgreement[] = reqs.map((r) => {
    // Latest score per candidate (a requisition can hold several scorecard versions).
    const latest = new Map<string, { candidateId: string; total: number; name: string }>()
    for (const s of scored.filter((x) => x.requisitionId === r.id)) {
      if (latest.has(s.candidateId)) continue
      const p = s.profile as CandidateProfile
      latest.set(s.candidateId, { candidateId: s.candidateId, total: s.total, name: `${p.firstName} ${p.lastName}`.trim() || 'Unnamed candidate' })
    }
    const submittedIds = [...new Set(real.filter((s) => s.requisitionId === r.id).map((s) => s.candidateId))]
    return {
      requisitionId: r.id,
      title: r.title,
      clientName: r.clientName,
      result: compareRanks([...latest.values()], new Set(submittedIds)),
      names: Object.fromEntries([...latest.values()].map((c) => [c.candidateId, c.name])),
      submittedIds,
    }
  })

  const submitted = rows.reduce((s, r) => s + r.result.submittedCount, 0)
  const agreed = rows.reduce((s, r) => s + r.result.agreedCount, 0)
  return { rows, submitted, agreed, agreementPct: submitted === 0 ? null : Math.round((agreed / submitted) * 100) }
}
