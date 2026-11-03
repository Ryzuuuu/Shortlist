/**
 * src/lib/ingestion/process.ts
 *
 * Processes ONE stored CV file end to end. State is persisted in cv_files.status
 * at every step, so a crashed or timed-out request can be retried (ASSUMPTION A3).
 *
 *   parse -> (scanned? vision LLM : needs_review) -> profile -> dedup (global pool)
 *   -> redact -> LLM per-criterion -> verify quotes -> code computes score
 *
 * AI rules enforced here: redaction before the LLM (3), quote verification (2),
 * code-computed total (1), never rejecting (4), never silently dropping (5).
 */
import { desc, eq, isNull } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import {
  calculateScore,
  extractProfile,
  findDuplicate,
  normaliseEmail,
  normalisePhone,
  redact,
  verifyQuote,
  type DedupCandidate,
} from '@shortlist/core'
import { db } from '@/db'
import { candidates, cvFiles, pipelineEntries, scorecards, scores } from '@/db/schema'
import type { CandidateProfile, ScorecardCriterion } from '@/db/types'
import { getLLMProvider, isVisionCapable, scoreWithCache } from '@/lib/llm'
import { parseCvFile } from './parse'
import { getFile } from './storage'

/** Mean confidence below this sends the CV to "Needs review" (AI rule 5). */
export const LOW_CONFIDENCE_THRESHOLD = 0.5

export type ProcessOutcome = 'scored' | 'needs_review' | 'failed'

async function setStatus(
  id: string,
  status: 'parsing' | 'scored' | 'failed' | 'needs_review',
  extra: Partial<{ errorMessage: string | null; isScanned: boolean; candidateId: string }> = {},
) {
  await db
    .update(cvFiles)
    .set({ status, updatedAt: new Date(), ...extra })
    .where(eq(cvFiles.id, id))
}

/** Scanned PDF: only a vision-capable provider with a key can read it (ASSUMPTION A4). */
async function visionExtract(buffer: Buffer, mimeType: string): Promise<string | null> {
  const provider = await getLLMProvider()
  if (!isVisionCapable(provider)) return null
  try {
    return await provider.extractTextFromImage(buffer.toString('base64'), mimeType)
  } catch {
    return null
  }
}

export async function processCvFile(fileId: string): Promise<ProcessOutcome> {
  const [file] = await db.select().from(cvFiles).where(eq(cvFiles.id, fileId)).limit(1)
  if (!file) throw new Error(`cv_file ${fileId} not found`)
  if (!file.storageUrl) {
    await setStatus(fileId, 'failed', { errorMessage: 'File was never stored' })
    return 'failed'
  }

  await setStatus(fileId, 'parsing', { errorMessage: null })

  try {
    const buffer = await getFile(file.storageUrl)
    const parsed = await parseCvFile(buffer, file.mimeType)

    if (parsed.failed) {
      await setStatus(fileId, 'failed', { errorMessage: parsed.errorMessage ?? 'Could not parse file' })
      return 'failed'
    }

    let text = parsed.text
    if (parsed.isScanned) {
      const ocr = await visionExtract(buffer, file.mimeType)
      if (!ocr || ocr.trim().length < 50) {
        await setStatus(fileId, 'needs_review', {
          isScanned: true,
          errorMessage: 'Scanned CV: no vision provider available. Review manually.',
        })
        return 'needs_review'
      }
      text = ocr.trim()
    }

    // ── Profile + global dedup (A2) ────────────────────────────────────────
    const extracted = extractProfile(text)
    const normEmail = normaliseEmail(extracted.email)
    const normPhone = normalisePhone(extracted.phone)
    const fullName = `${extracted.firstName} ${extracted.lastName}`.trim()

    const pool = await db
      .select({
        id: candidates.id,
        normalisedEmail: candidates.normalisedEmail,
        normalisedPhone: candidates.normalisedPhone,
        profile: candidates.profile,
      })
      .from(candidates)
      .where(isNull(candidates.deletedAt))

    const incoming: DedupCandidate = {
      id: '',
      normalisedEmail: normEmail,
      normalisedPhone: normPhone,
      identity: {
        fullName,
        currentCompany: extracted.currentCompany,
        currentRole: extracted.currentRole,
      },
    }
    const match = findDuplicate(
      incoming,
      pool.map((c) => {
        const p = c.profile as CandidateProfile
        return {
          id: c.id,
          normalisedEmail: c.normalisedEmail,
          normalisedPhone: c.normalisedPhone,
          identity: {
            fullName: `${p.firstName} ${p.lastName}`.trim(),
            currentCompany: p.currentCompany,
            currentRole: p.currentRole,
          },
        }
      }),
    )

    let candidateId: string
    if (match) {
      candidateId = match.candidateId
    } else {
      candidateId = createId()
      const profile: CandidateProfile = {
        firstName: extracted.firstName,
        lastName: extracted.lastName,
        email: extracted.email,
        phone: extracted.phone,
        headline: extracted.headline,
        currentCompany: extracted.currentCompany,
        currentRole: extracted.currentRole,
        location: extracted.location,
        skills: extracted.skills,
        workHistory: [],
        education: [],
      }
      // Consent defaults (purpose = hiring only) are set by the column defaults (A8).
      await db.insert(candidates).values({
        id: candidateId,
        profile,
        rawText: text,
        contentHash: parsed.contentHash,
        normalisedEmail: normEmail,
        normalisedPhone: normPhone,
      })
    }

    await db.update(cvFiles).set({ candidateId }).where(eq(cvFiles.id, fileId))

    // Every uploaded candidate enters the requisition pipeline at "sourced".
    await db
      .insert(pipelineEntries)
      .values({
        id: createId(),
        candidateId,
        requisitionId: file.requisitionId,
        stage: 'sourced',
        updatedByUserId: file.uploadedByUserId,
      })
      .onConflictDoNothing()

    // ── Score against the latest scorecard ─────────────────────────────────
    const [scorecard] = await db
      .select()
      .from(scorecards)
      .where(eq(scorecards.requisitionId, file.requisitionId))
      .orderBy(desc(scorecards.version))
      .limit(1)

    if (!scorecard) {
      await setStatus(fileId, 'needs_review', {
        isScanned: parsed.isScanned,
        candidateId,
        errorMessage: 'No scorecard for this requisition yet.',
      })
      return 'needs_review'
    }

    const [cand] = await db
      .select({ rawText: candidates.rawText, contentHash: candidates.contentHash })
      .from(candidates)
      .where(eq(candidates.id, candidateId))
      .limit(1)
    const sourceText = cand?.rawText ?? text
    const criteria = scorecard.criteria as ScorecardCriterion[]

    const { redactedText } = redact(sourceText)
    const response = await scoreWithCache(cand?.contentHash ?? parsed.contentHash, scorecard.id, {
      redactedText,
      criteria,
      cacheKey: `${cand?.contentHash ?? parsed.contentHash}:${scorecard.version}`,
    })

    // Verify every quote against the original CV text; drop unverifiable evidence.
    const perCriterion = response.criteria.map((r) => {
      const hasClaim = r.met === 'yes' || r.met === 'partial'
      const v = r.quote ? verifyQuote(r.quote, sourceText) : { verified: false }
      const unverified = hasClaim && !v.verified
      return {
        criterionId: r.criterionId,
        met: r.met,
        // A claim without verifiable evidence counts as unknown and shows no quote.
        effectiveMet: unverified ? ('unknown' as const) : r.met,
        quote: v.verified ? r.quote : null,
        confidence: r.confidence,
        evidenceStatus: unverified ? ('unverified' as const) : v.verified ? ('verified' as const) : ('none' as const),
      }
    })

    const result = calculateScore(
      criteria.map((c) => ({ id: c.id, weight: c.weight, mustHave: c.mustHave })),
      perCriterion.map((r) => ({
        criterionId: r.criterionId,
        met: r.effectiveMet,
        verified: r.evidenceStatus === 'verified',
      })),
    )

    await db
      .insert(scores)
      .values({
        id: createId(),
        candidateId,
        requisitionId: file.requisitionId,
        scorecardId: scorecard.id,
        perCriterion,
        total: result.total,
        isBelowFit: result.isBelowFit,
        llmProvider: response.provider,
        fromCache: response.fromCache,
      })
      .onConflictDoNothing()

    const meanConfidence =
      perCriterion.length === 0
        ? 0
        : perCriterion.reduce((s, r) => s + r.confidence, 0) / perCriterion.length

    if (meanConfidence < LOW_CONFIDENCE_THRESHOLD) {
      await setStatus(fileId, 'needs_review', {
        isScanned: parsed.isScanned,
        candidateId,
        errorMessage: 'Low AI confidence. Review manually.',
      })
      return 'needs_review'
    }

    await setStatus(fileId, 'scored', { isScanned: parsed.isScanned, candidateId })
    return 'scored'
  } catch (err) {
    await setStatus(fileId, 'failed', {
      errorMessage: err instanceof Error ? err.message : 'Processing failed',
    })
    return 'failed'
  }
}
