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
import { and, desc, eq, gte, isNull, ne } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import {
  calculateScore,
  extractProfile,
  findDuplicate,
  normaliseEmail,
  nameFromFilename,
  normalisePhone,
  redact,
  salvageQuote,
  verifyQuote,
  type DedupCandidate,
  type ExtractedProfile,
} from '@shortlist/core'
import { db } from '@/db'
import { aiReviewSamples, candidates, cvFiles, pipelineEntries, scorecards, scores } from '@/db/schema'
import type { CandidateProfile, ScorecardCriterion } from '@/db/types'
import { getLLMProvider, isVisionCapable, scoreWithCache } from '@/lib/llm'
import { LLMRefusalError } from '@/lib/llm/shared'
import { parseCvFile } from './parse'
import { getFile } from './storage'

/** Mean confidence below this sends the CV to "Needs review" (AI rule 5). */
export const LOW_CONFIDENCE_THRESHOLD = 0.5

/** How far back to look for a concurrent upload of the same person (see resolveConcurrentDuplicate). */
const CONCURRENT_UPLOAD_WINDOW_MS = 10 * 60 * 1000

export type ProcessOutcome = 'scored' | 'needs_review' | 'failed'

type Status = 'parsing' | 'scored' | 'failed' | 'needs_review'

async function setStatus(
  id: string,
  status: Status,
  extra: Partial<{ errorMessage: string | null; isScanned: boolean; candidateId: string }> = {},
) {
  await db
    .update(cvFiles)
    .set({ status, updatedAt: new Date(), ...extra })
    .where(eq(cvFiles.id, id))
}

/** Scanned PDF: only a vision-capable provider with a key can read it (ASSUMPTION A4). */
async function visionExtract(buffer: Buffer, mimeType: string): Promise<{ text: string | null; capable: boolean }> {
  const provider = await getLLMProvider()
  if (!isVisionCapable(provider)) return { text: null, capable: false }
  try {
    return { text: await provider.extractTextFromImage(buffer.toString('base64'), mimeType), capable: true }
  } catch {
    return { text: null, capable: true }
  }
}

function toProfile(e: ExtractedProfile): CandidateProfile {
  return {
    firstName: e.firstName,
    lastName: e.lastName,
    email: e.email,
    phone: e.phone,
    headline: e.headline,
    currentCompany: e.currentCompany,
    currentRole: e.currentRole,
    location: e.location,
    skills: e.skills,
    workHistory: e.workHistory.map((w) => ({ ...w, description: '' })),
    education: e.education.map((d) => ({ institution: d.institution, degree: d.degree, field: '', graduationYear: d.graduationYear })),
    experienceYears: e.experienceYears,
    noticeDays: e.statedNoticeDays,
    ctcLpa: e.ctcLpa,
  }
}

interface PoolRow {
  id: string
  normalisedEmail: string | null
  normalisedPhone: string | null
  profile: unknown
}

function toDedup(row: PoolRow): DedupCandidate {
  const p = row.profile as CandidateProfile
  return {
    id: row.id,
    normalisedEmail: row.normalisedEmail,
    normalisedPhone: row.normalisedPhone,
    identity: { fullName: `${p.firstName} ${p.lastName}`.trim(), currentCompany: p.currentCompany, currentRole: p.currentRole },
  }
}

/**
 * Up to four uploads run at once, so two copies of the same person in one batch
 * can both pass the duplicate check and both insert. After inserting, look again
 * at candidates created at or before this one; the LATER insert defers to the
 * EARLIER one (ties broken by id), deletes itself, and uses the earlier record.
 * Whichever insert committed second is guaranteed to see the first.
 */
async function resolveConcurrentDuplicate(candidateId: string, incoming: DedupCandidate): Promise<string> {
  const [mine] = await db.select({ createdAt: candidates.createdAt }).from(candidates).where(eq(candidates.id, candidateId)).limit(1)
  if (!mine) return candidateId

  const rivals = await db
    .select({
      id: candidates.id,
      normalisedEmail: candidates.normalisedEmail,
      normalisedPhone: candidates.normalisedPhone,
      profile: candidates.profile,
      createdAt: candidates.createdAt,
    })
    .from(candidates)
    .where(
      and(
        isNull(candidates.deletedAt),
        ne(candidates.id, candidateId),
        gte(candidates.createdAt, new Date(mine.createdAt.getTime() - CONCURRENT_UPLOAD_WINDOW_MS)),
      ),
    )

  const earlier = rivals.filter(
    (r) => r.createdAt < mine.createdAt || (r.createdAt.getTime() === mine.createdAt.getTime() && r.id < candidateId),
  )
  const match = findDuplicate({ ...incoming, id: candidateId }, earlier.map(toDedup))
  if (!match) return candidateId

  await db.delete(candidates).where(eq(candidates.id, candidateId))
  return match.candidateId
}

export type ScoreOutcome = { kind: 'no_scorecard' } | { kind: 'scored'; lowConfidence: boolean }

/**
 * Scores one candidate against the requisition's latest scorecard and stores the
 * result. Used for every upload and by the re-score maintenance command, so both
 * apply exactly the same rules. `replace` discards an earlier score for the same
 * scorecard first (and the cached model answer), instead of keeping it.
 */
export async function scoreCandidate(
  candidateId: string,
  requisitionId: string,
  fallback: { text: string; hash: string },
  options: { replace?: boolean } = {},
): Promise<ScoreOutcome> {
  const [scorecard] = await db
    .select()
    .from(scorecards)
    .where(eq(scorecards.requisitionId, requisitionId))
    .orderBy(desc(scorecards.version))
    .limit(1)
  if (!scorecard) return { kind: 'no_scorecard' }

  const [cand] = await db
    .select({ rawText: candidates.rawText, contentHash: candidates.contentHash, profile: candidates.profile })
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1)
  const sourceText = cand?.rawText ?? fallback.text
  const hash = cand?.contentHash ?? fallback.hash
  const criteria = scorecard.criteria as ScorecardCriterion[]

  if (options.replace) {
    await db.delete(aiReviewSamples).where(and(eq(aiReviewSamples.contentHash, hash), eq(aiReviewSamples.scorecardId, scorecard.id)))
    await db.delete(scores).where(and(eq(scores.candidateId, candidateId), eq(scores.requisitionId, requisitionId), eq(scores.scorecardId, scorecard.id)))
  }

  // AI rule 3: only redacted text ever reaches the model, including the candidate's own name.
  const p = cand?.profile as Partial<CandidateProfile> | undefined
  const names = [p?.firstName, p?.lastName].filter((n): n is string => !!n)
  const { redactedText } = redact(sourceText, { names })
  const response = await scoreWithCache(hash, scorecard.id, { redactedText, criteria, cacheKey: `${hash}:${scorecard.version}` })

  // AI rule 2: verify every quote against the original CV text; drop unverifiable evidence.
  const perCriterion = response.criteria.map((r) => {
    const hasClaim = r.met === 'yes' || r.met === 'partial'
    // The reader saw redacted text; keep only a part of its quote that truly exists in the CV.
    const quote = salvageQuote(r.quote, sourceText)
    const verified = quote !== null && verifyQuote(quote, sourceText).verified
    const unverified = hasClaim && !verified
    return {
      criterionId: r.criterionId,
      met: r.met,
      // A claim without verifiable evidence counts as unknown and shows no quote.
      effectiveMet: unverified ? ('unknown' as const) : r.met,
      quote: verified ? quote : null,
      confidence: r.confidence,
      evidenceStatus: unverified ? ('unverified' as const) : verified ? ('verified' as const) : ('none' as const),
    }
  })

  // AI rule 1: the total is computed here, from the scorecard weights, never by the model.
  const result = calculateScore(
    criteria.map((c) => ({ id: c.id, weight: c.weight, mustHave: c.mustHave })),
    perCriterion.map((r) => ({ criterionId: r.criterionId, met: r.effectiveMet, verified: r.evidenceStatus === 'verified' })),
  )

  await db
    .insert(scores)
    .values({
      id: createId(),
      candidateId,
      requisitionId,
      scorecardId: scorecard.id,
      perCriterion,
      total: result.total,
      isBelowFit: result.isBelowFit,
      llmProvider: response.provider,
      fromCache: response.fromCache,
    })
    .onConflictDoNothing()

  const meanConfidence = perCriterion.length === 0 ? 0 : perCriterion.reduce((sum, r) => sum + r.confidence, 0) / perCriterion.length
  return { kind: 'scored', lowConfidence: meanConfidence < LOW_CONFIDENCE_THRESHOLD }
}

export async function processCvFile(fileId: string): Promise<ProcessOutcome> {
  const [file] = await db.select().from(cvFiles).where(eq(cvFiles.id, fileId)).limit(1)
  if (!file) throw new Error(`cv_file ${fileId} not found`)
  if (!file.storageUrl) {
    await setStatus(fileId, 'failed', { errorMessage: 'File was never stored' })
    return 'failed'
  }

  await setStatus(fileId, 'parsing', { errorMessage: null })

  let candidateId: string | undefined
  let isScanned = false

  try {
    const buffer = await getFile(file.storageUrl)
    const parsed = await parseCvFile(buffer, file.mimeType)

    if (parsed.failed) {
      await setStatus(fileId, 'failed', { errorMessage: parsed.errorMessage ?? 'Could not parse file' })
      return 'failed'
    }

    let text = parsed.text
    isScanned = parsed.isScanned
    if (parsed.isScanned) {
      const ocr = await visionExtract(buffer, file.mimeType)
      if (!ocr.text || ocr.text.trim().length < 50) {
        await setStatus(fileId, 'needs_review', {
          isScanned: true,
          errorMessage: ocr.capable
            ? 'Scanned CV: the AI reader could not transcribe it. Review manually.'
            : 'Scanned CV: no vision-capable AI provider is configured. Review manually.',
        })
        return 'needs_review'
      }
      text = ocr.text.trim()
    }

    // ── Profile + global dedup (A2) ────────────────────────────────────────
    const extracted = extractProfile(text)
    // Templates with columns or graphics often hide the name from text extraction; the file name usually has it.
    if (!extracted.firstName) {
      const named = nameFromFilename(file.originalFilename)
      if (named) Object.assign(extracted, named)
    }
    const normEmail = normaliseEmail(extracted.email)
    const normPhone = normalisePhone(extracted.phone)
    const incoming: DedupCandidate = {
      id: '',
      normalisedEmail: normEmail,
      normalisedPhone: normPhone,
      identity: {
        fullName: `${extracted.firstName} ${extracted.lastName}`.trim(),
        currentCompany: extracted.currentCompany,
        currentRole: extracted.currentRole,
      },
    }

    const pool = await db
      .select({ id: candidates.id, normalisedEmail: candidates.normalisedEmail, normalisedPhone: candidates.normalisedPhone, profile: candidates.profile })
      .from(candidates)
      .where(isNull(candidates.deletedAt))

    const match = findDuplicate(incoming, pool.map(toDedup))
    if (match) {
      candidateId = match.candidateId
    } else {
      candidateId = createId()
      // Consent defaults (purpose = hiring only) are set by the column defaults (A8).
      await db.insert(candidates).values({
        id: candidateId,
        profile: toProfile(extracted),
        rawText: text,
        contentHash: parsed.contentHash,
        normalisedEmail: normEmail,
        normalisedPhone: normPhone,
      })
      candidateId = await resolveConcurrentDuplicate(candidateId, incoming)
    }

    await db.update(cvFiles).set({ candidateId }).where(eq(cvFiles.id, fileId))

    // Every uploaded candidate enters the requisition pipeline at "sourced".
    await db
      .insert(pipelineEntries)
      .values({ id: createId(), candidateId, requisitionId: file.requisitionId, stage: 'sourced', updatedByUserId: file.uploadedByUserId })
      .onConflictDoNothing()

    // ── Score against the latest scorecard ─────────────────────────────────
    const outcome = await scoreCandidate(candidateId, file.requisitionId, { text, hash: parsed.contentHash })
    if (outcome.kind === 'no_scorecard') {
      await setStatus(fileId, 'needs_review', { isScanned, candidateId, errorMessage: 'No scorecard for this requisition yet.' })
      return 'needs_review'
    }

    // AI rule 5: low confidence is surfaced for a person, never silently accepted.
    if (outcome.lowConfidence) {
      await setStatus(fileId, 'needs_review', { isScanned, candidateId, errorMessage: 'Low AI confidence. Review manually.' })
      return 'needs_review'
    }

    await setStatus(fileId, 'scored', { isScanned, candidateId })
    return 'scored'
  } catch (err) {
    // The AI reader declined: that is a person's decision to make, not a failure to retry.
    if (err instanceof LLMRefusalError) {
      await setStatus(fileId, 'needs_review', {
        isScanned,
        ...(candidateId ? { candidateId } : {}),
        errorMessage: 'The AI reader declined to assess this CV. Review manually.',
      })
      return 'needs_review'
    }
    await setStatus(fileId, 'failed', {
      ...(candidateId ? { candidateId } : {}),
      errorMessage: (err instanceof Error ? err.message : 'Processing failed').slice(0, 300),
    })
    return 'failed'
  }
}
