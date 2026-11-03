import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { pipelineEntries, submissions } from '@/db/schema'

/** Whether the recruiter has already opened this CV, and the candidate's current stage. */
export async function loadReviewState(requisitionId: string, candidateId: string) {
  const [[sub], [entry]] = await Promise.all([
    db
      .select({ viewedAt: submissions.viewedByRecruiterAt })
      .from(submissions)
      .where(and(eq(submissions.candidateId, candidateId), eq(submissions.requisitionId, requisitionId)))
      .limit(1),
    db
      .select({ stage: pipelineEntries.stage })
      .from(pipelineEntries)
      .where(and(eq(pipelineEntries.candidateId, candidateId), eq(pipelineEntries.requisitionId, requisitionId)))
      .limit(1),
  ])
  return { opened: sub?.viewedAt != null, stage: entry?.stage ?? 'sourced' }
}
