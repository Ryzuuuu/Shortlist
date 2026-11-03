/**
 * src/lib/queries/recruiter.ts
 *
 * Read models for the recruiter screens. Callers must already have passed
 * `can()`; these functions do not authorise.
 */
import { and, count, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { candidates, clients, cvFiles, pipelineEntries, requisitions, scorecards, scores, submissions } from '@/db/schema'
import type { CandidateProfile, ScorecardCriterion } from '@/db/types'

export interface RequisitionRow {
  id: string
  title: string
  clientName: string
  candidateCount: number
  createdAt: Date
}

export async function listRequisitions(): Promise<RequisitionRow[]> {
  const [reqs, counts] = await Promise.all([
    db
      .select({ id: requisitions.id, title: requisitions.title, clientName: clients.name, createdAt: requisitions.createdAt })
      .from(requisitions)
      .innerJoin(clients, eq(clients.id, requisitions.clientId))
      .orderBy(desc(requisitions.createdAt)),
    db.select({ requisitionId: scores.requisitionId, n: count() }).from(scores).groupBy(scores.requisitionId),
  ])
  const byReq = new Map(counts.map((c) => [c.requisitionId, c.n]))
  return reqs.map((r) => ({ ...r, candidateCount: byReq.get(r.id) ?? 0 }))
}

export async function listClients() {
  return db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(clients.name)
}

export async function getRequisition(id: string) {
  const [row] = await db
    .select({ id: requisitions.id, title: requisitions.title, jdText: requisitions.jdText, clientId: requisitions.clientId, clientName: clients.name })
    .from(requisitions)
    .innerJoin(clients, eq(clients.id, requisitions.clientId))
    .where(eq(requisitions.id, id))
    .limit(1)
  return row ?? null
}

export async function getLatestScorecard(requisitionId: string) {
  const [row] = await db.select().from(scorecards).where(eq(scorecards.requisitionId, requisitionId)).orderBy(desc(scorecards.version)).limit(1)
  return row ? { ...row, criteria: row.criteria as ScorecardCriterion[] } : null
}

/** One stored per-criterion result, as written by the ingestion pipeline. */
export interface CriterionResult {
  criterionId: string
  met: 'yes' | 'partial' | 'no' | 'unknown'
  effectiveMet: 'yes' | 'partial' | 'no' | 'unknown'
  /** Only ever a verified quote; unverified quotes are null (AI rule 2). */
  quote: string | null
  confidence: number
  evidenceStatus: 'verified' | 'unverified' | 'none'
}

export interface RankedRow {
  candidateId: string
  name: string
  headline: string
  total: number
  isBelowFit: boolean
  stage: string
  opened: boolean
  results: CriterionResult[]
}

/** All scored candidates for a requisition, best first. Below-fit stay in the list (AI rule 4). */
export async function getRanking(requisitionId: string): Promise<RankedRow[]> {
  const rows = await db
    .select({
      candidateId: scores.candidateId,
      total: scores.total,
      isBelowFit: scores.isBelowFit,
      perCriterion: scores.perCriterion,
      profile: candidates.profile,
      stage: pipelineEntries.stage,
      viewedAt: submissions.viewedByRecruiterAt,
    })
    .from(scores)
    .innerJoin(candidates, eq(candidates.id, scores.candidateId))
    .leftJoin(
      pipelineEntries,
      and(eq(pipelineEntries.candidateId, scores.candidateId), eq(pipelineEntries.requisitionId, scores.requisitionId)),
    )
    .leftJoin(
      submissions,
      and(eq(submissions.candidateId, scores.candidateId), eq(submissions.requisitionId, scores.requisitionId)),
    )
    .where(eq(scores.requisitionId, requisitionId))
    .orderBy(desc(scores.total))

  return rows.map((r) => {
    const p = r.profile as CandidateProfile
    return {
      candidateId: r.candidateId,
      name: `${p.firstName} ${p.lastName}`.trim() || 'Unnamed candidate',
      headline: p.headline || p.currentRole || '',
      total: r.total,
      isBelowFit: r.isBelowFit,
      stage: r.stage ?? 'sourced',
      opened: r.viewedAt != null,
      results: r.perCriterion as CriterionResult[],
    }
  })
}

/** Files that need a human: failed or flagged for review. Never silently dropped (AI rule 5). */
export async function getAttentionFiles(requisitionId: string) {
  return db
    .select({ id: cvFiles.id, filename: cvFiles.originalFilename, status: cvFiles.status, message: cvFiles.errorMessage, isScanned: cvFiles.isScanned })
    .from(cvFiles)
    .where(and(eq(cvFiles.requisitionId, requisitionId), inArray(cvFiles.status, ['failed', 'needs_review'])))
    .orderBy(desc(cvFiles.updatedAt))
}
