/**
 * src/lib/compliance/delete-candidate.ts
 *
 * DPDP Act 2023 deletion on request (ASSUMPTION A9). Hard-deletes the profile,
 * the stored CV files and the cached AI results, and leaves only an anonymised
 * audit stub. The caller must already have passed can(user, 'candidate:delete').
 *
 * Ordering is deliberate. Neon's HTTP driver has no multi-statement transactions,
 * so each step is safe to repeat and the candidate row is removed last:
 *   1. delete stored files  (any failure aborts: nothing else is touched, retry later)
 *   2. clear cached LLM output (it contains quotes from the CV)
 *   3. anonymise existing audit rows and write the stub (deterministic id, idempotent)
 *   4. delete the candidate row (cascades to scores, pipeline, submissions, feedback)
 */
import { eq, inArray } from 'drizzle-orm'
import { anonymiseId } from '@shortlist/core'
import { db } from '@/db'
import { aiReviewSamples, auditLog, candidates, cvFiles } from '@/db/schema'
import { deleteFile } from '@/lib/ingestion/storage'

export type DeletionResult = { ok: true } | { ok: false; error: string }

function auditKey(): string {
  const key = process.env.AUDIT_HASH_KEY ?? process.env.BETTER_AUTH_SECRET
  if (!key) throw new Error('AUDIT_HASH_KEY (or BETTER_AUTH_SECRET) must be set to delete candidates')
  return key
}

export async function deleteCandidateData(candidateId: string, actorUserId: string): Promise<DeletionResult> {
  const key = auditKey()
  const anonId = anonymiseId(candidateId, key)

  const [candidate] = await db.select({ contentHash: candidates.contentHash }).from(candidates).where(eq(candidates.id, candidateId)).limit(1)
  if (!candidate) return { ok: false, error: 'Candidate not found.' }

  const files = await db
    .select({ storageUrl: cvFiles.storageUrl, contentHash: cvFiles.contentHash })
    .from(cvFiles)
    .where(eq(cvFiles.candidateId, candidateId))

  // 1. Files first: if storage fails we stop with the database untouched, so a retry still knows the keys.
  for (const f of files) {
    if (!f.storageUrl) continue
    try {
      await deleteFile(f.storageUrl)
    } catch {
      return { ok: false, error: 'Could not delete the stored CV file. Nothing was removed; please try again.' }
    }
  }

  // 2. Cached AI output for this CV.
  const hashes = [...new Set([candidate.contentHash, ...files.map((f) => f.contentHash)])]
  await db.delete(aiReviewSamples).where(inArray(aiReviewSamples.contentHash, hashes))

  // 3. Unlink history, then record the deletion.
  await db.update(auditLog).set({ candidateId: anonId, metadata: null }).where(eq(auditLog.candidateId, candidateId))
  await db
    .insert(auditLog)
    .values({ id: `deleted-${anonId}`, userId: actorUserId, candidateId: anonId, requisitionId: null, action: 'candidate_deleted' })
    .onConflictDoNothing()

  // 4. The profile itself.
  await db.delete(candidates).where(eq(candidates.id, candidateId))
  return { ok: true }
}
