/**
 * src/lib/queries/recruiter.ts
 *
 * Read models for the recruiter screens. Callers must already have passed
 * `can()`; these functions do not authorise.
 */
import { and, count, desc, eq, inArray } from 'drizzle-orm'
import { evaluateFilters, type FilterCheck, type PipelineStage } from '@shortlist/core'
import { db } from '@/db'
import { candidates, clients, cvFiles, pipelineEntries, requisitions, scorecards, scores, submissions } from '@/db/schema'
import type { CandidateProfile, ScorecardCriterion } from '@/db/types'
import { isStaleProcessing } from '@/lib/ingestion/constants'

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

export interface ScorecardFilter {
  id: string
  label: string
  type: string
  value: unknown
}

export async function getLatestScorecard(requisitionId: string) {
  const [row] = await db.select().from(scorecards).where(eq(scorecards.requisitionId, requisitionId)).orderBy(desc(scorecards.version)).limit(1)
  return row ? { ...row, criteria: row.criteria as ScorecardCriterion[], filters: (row.filters ?? []) as ScorecardFilter[] } : null
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

export function profileFacts(p: CandidateProfile) {
  return { experienceYears: p.experienceYears ?? null, noticeDays: p.noticeDays ?? null, ctcLpa: p.ctcLpa ?? null, location: p.location }
}

export interface RankedRow {
  candidateId: string
  name: string
  headline: string
  skills: string[]
  total: number
  isBelowFit: boolean
  stage: string
  opened: boolean
  needsReview: boolean
  /** JD filters compared with what the CV states. Labels only; they never hide anyone. */
  checks: FilterCheck[]
  results: CriterionResult[]
}

/**
 * All scored candidates for a requisition, best first. Below-fit stay in the list
 * (AI rule 4). Equal scores are ordered by how many JD filters are missed, then met.
 */
export async function getRanking(requisitionId: string, filters: ScorecardFilter[] = []): Promise<RankedRow[]> {
  const [rows, reviewFiles] = await Promise.all([
    db
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
      .orderBy(desc(scores.total)),
    db
      .select({ candidateId: cvFiles.candidateId })
      .from(cvFiles)
      .where(and(eq(cvFiles.requisitionId, requisitionId), eq(cvFiles.status, 'needs_review'))),
  ])
  const needsReview = new Set(reviewFiles.map((f) => f.candidateId).filter((id): id is string => !!id))

  const ranked = rows.map((r): RankedRow => {
    const p = r.profile as CandidateProfile
    return {
      candidateId: r.candidateId,
      name: `${p.firstName} ${p.lastName}`.trim() || 'Unnamed candidate',
      headline: p.headline || p.currentRole || '',
      skills: p.skills ?? [],
      total: r.total,
      isBelowFit: r.isBelowFit,
      stage: r.stage ?? 'sourced',
      opened: r.viewedAt != null,
      needsReview: needsReview.has(r.candidateId),
      checks: evaluateFilters(filters, profileFacts(p)),
      results: r.perCriterion as CriterionResult[],
    }
  })

  const misses = (r: RankedRow) => r.checks.filter((c) => c.status === 'misses').length
  const meets = (r: RankedRow) => r.checks.filter((c) => c.status === 'meets').length
  return ranked.sort((a, b) => b.total - a.total || misses(a) - misses(b) || meets(b) - meets(a) || a.name.localeCompare(b.name))
}

export interface AttentionFile {
  id: string
  filename: string
  status: string
  message: string | null
  isScanned: boolean
}

/**
 * Files that need a person: failed, flagged for review, or abandoned mid-processing.
 * Nothing is ever silently dropped (AI rule 5).
 */
export async function getAttentionFiles(requisitionId: string): Promise<AttentionFile[]> {
  const rows = await db
    .select({
      id: cvFiles.id,
      filename: cvFiles.originalFilename,
      status: cvFiles.status,
      message: cvFiles.errorMessage,
      isScanned: cvFiles.isScanned,
      updatedAt: cvFiles.updatedAt,
    })
    .from(cvFiles)
    .where(and(eq(cvFiles.requisitionId, requisitionId), inArray(cvFiles.status, ['failed', 'needs_review', 'parsing', 'pending'])))
    .orderBy(desc(cvFiles.updatedAt))

  return rows
    .filter((r) => r.status === 'failed' || r.status === 'needs_review' || isStaleProcessing(r.status, r.updatedAt))
    .map((r) =>
      r.status === 'parsing' || r.status === 'pending'
        ? { id: r.id, filename: r.filename, status: 'failed', message: 'Processing did not finish (it timed out or was interrupted). Retry.', isScanned: r.isScanned }
        : { id: r.id, filename: r.filename, status: r.status, message: r.message, isScanned: r.isScanned },
    )
}

export interface PipelineCard {
  candidateId: string
  name: string
  headline: string
  total: number
  isBelowFit: boolean
  stage: PipelineStage
  rejectionReason: string | null
}

/** Every candidate in a requisition with their stage, for the pipeline board. */
export async function getPipeline(requisitionId: string): Promise<PipelineCard[]> {
  const rows = await db
    .select({
      candidateId: pipelineEntries.candidateId,
      stage: pipelineEntries.stage,
      rejectionReason: pipelineEntries.rejectionReason,
      profile: candidates.profile,
      total: scores.total,
      isBelowFit: scores.isBelowFit,
    })
    .from(pipelineEntries)
    .innerJoin(candidates, eq(candidates.id, pipelineEntries.candidateId))
    .leftJoin(scores, and(eq(scores.candidateId, pipelineEntries.candidateId), eq(scores.requisitionId, pipelineEntries.requisitionId)))
    .where(eq(pipelineEntries.requisitionId, requisitionId))
    .orderBy(desc(scores.total))

  return rows.map((r) => {
    const p = r.profile as CandidateProfile
    return {
      candidateId: r.candidateId,
      name: `${p.firstName} ${p.lastName}`.trim() || 'Unnamed candidate',
      headline: p.headline || p.currentRole || '',
      total: r.total ?? 0,
      isBelowFit: r.isBelowFit ?? false,
      stage: r.stage as PipelineStage,
      rejectionReason: r.rejectionReason,
    }
  })
}
