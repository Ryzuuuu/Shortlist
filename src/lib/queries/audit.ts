/**
 * src/lib/queries/audit.ts
 *
 * Audit trail read model: who viewed or changed what, and when. The caller must
 * already have passed can(user, 'audit:read'). Candidates removed under a DPDP
 * request appear only as "Deleted candidate" (their id is anonymised).
 */
import { desc, eq } from 'drizzle-orm'
import { isAnonymisedId } from '@shortlist/core'
import { db } from '@/db'
import { auditLog, candidates, requisitions, users } from '@/db/schema'
import type { CandidateProfile } from '@/db/types'

export const AUDIT_PAGE_SIZE = 50

export interface AuditRow {
  id: string
  at: Date
  action: string
  actor: string
  candidate: string
  requisition: string
}

export async function listAuditEntries(page: number): Promise<{ rows: AuditRow[]; hasMore: boolean }> {
  const rows = await db
    .select({
      id: auditLog.id,
      at: auditLog.createdAt,
      action: auditLog.action,
      candidateId: auditLog.candidateId,
      actor: users.name,
      profile: candidates.profile,
      requisition: requisitions.title,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .leftJoin(candidates, eq(candidates.id, auditLog.candidateId))
    .leftJoin(requisitions, eq(requisitions.id, auditLog.requisitionId))
    .orderBy(desc(auditLog.createdAt))
    .limit(AUDIT_PAGE_SIZE + 1)
    .offset(page * AUDIT_PAGE_SIZE)

  const view = rows.slice(0, AUDIT_PAGE_SIZE).map((r) => {
    const p = r.profile as CandidateProfile | null
    const name = p ? `${p.firstName} ${p.lastName}`.trim() : ''
    return {
      id: r.id,
      at: r.at,
      action: r.action,
      actor: r.actor ?? 'System',
      candidate: isAnonymisedId(r.candidateId) ? 'Deleted candidate' : name || (r.candidateId ? 'Unknown candidate' : '—'),
      requisition: r.requisition ?? '—',
    }
  })
  return { rows: view, hasMore: rows.length > AUDIT_PAGE_SIZE }
}
