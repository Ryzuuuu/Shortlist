/**
 * src/lib/queries/success.ts
 *
 * The brief's success measures for the delivery head. The caller must already have
 * passed can(user, 'insights:read'). First-submission time comes from the audit log,
 * which records every submit made through the app.
 */
import { eq, min } from 'drizzle-orm'
import { clientAcceptance, shortlistTimeliness, type Rate } from '@shortlist/core'
import { db } from '@/db'
import { auditLog, clientFeedback, requisitions } from '@/db/schema'

export interface SuccessMetrics {
  shortlist48h: Rate
  acceptance: Rate
}

export async function getSuccessMetrics(now: Date = new Date()): Promise<SuccessMetrics> {
  const [reqs, firsts, feedback] = await Promise.all([
    db.select({ id: requisitions.id, createdAt: requisitions.createdAt }).from(requisitions),
    db
      .select({ requisitionId: auditLog.requisitionId, first: min(auditLog.createdAt) })
      .from(auditLog)
      .where(eq(auditLog.action, 'candidate_submitted'))
      .groupBy(auditLog.requisitionId),
    db.select({ action: clientFeedback.action }).from(clientFeedback),
  ])

  const firstByReq = new Map(firsts.filter((f) => f.requisitionId && f.first).map((f) => [f.requisitionId as string, new Date(f.first as unknown as string | Date)]))
  return {
    shortlist48h: shortlistTimeliness(reqs.map((r) => ({ createdAt: r.createdAt, firstSubmittedAt: firstByReq.get(r.id) ?? null })), now),
    acceptance: clientAcceptance(feedback.map((f) => f.action)),
  }
}
