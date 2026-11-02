/**
 * src/lib/llm/types.ts
 *
 * Shared types for the LLM provider abstraction layer.
 * The LLM provider interface is the ONLY thing the ingestion service talks to.
 * It returns raw per-criterion responses; score computation stays in packages/core.
 */
import type { ScorecardCriterion } from '@/db/types'

// ─── LLM Request ─────────────────────────────────────────────────────────────

export interface LLMScoringRequest {
  /**
   * The redacted CV text (PII stripped by packages/core/redact).
   * This is what gets sent to the LLM.
   */
  redactedText: string
  /** Scorecard criteria to evaluate against */
  criteria: ScorecardCriterion[]
  /**
   * SHA-256 of the original file content + scorecard version.
   * Used as the cache key.
   */
  cacheKey: string
}

// ─── LLM Response ────────────────────────────────────────────────────────────

export type CriterionMet = 'yes' | 'partial' | 'no' | 'unknown'

/**
 * The ONLY thing the LLM is allowed to return per criterion.
 * Score is computed deterministically from this by packages/core/score-calculator.
 */
export interface LLMCriterionResponse {
  criterionId: string
  met: CriterionMet
  /**
   * Exact substring from the redacted CV text.
   * Will be verified against rawText (pre-redaction) by quote-verifier.
   * null if the LLM found no supporting evidence.
   */
  quote: string | null
  /** 0–1 confidence in the assessment */
  confidence: number
}

export interface LLMScoringResponse {
  criteria: LLMCriterionResponse[]
  /**
   * Provider that produced this response.
   * Stored on the score record for audit purposes.
   */
  provider: 'anthropic' | 'gemini' | 'heuristic'
  /** True if this response came from the cache */
  fromCache: boolean
}

// ─── Provider interface ───────────────────────────────────────────────────────

/**
 * LLMProvider interface.
 * All providers must implement this. The active provider is selected at
 * runtime via the LLM_PROVIDER environment variable.
 */
export interface LLMProvider {
  readonly name: 'anthropic' | 'gemini' | 'heuristic'
  /**
   * Score a CV against a set of scorecard criteria.
   * The provider MUST NOT compute a total score — only return per-criterion results.
   */
  score(request: LLMScoringRequest): Promise<LLMScoringResponse>
  /**
   * Extract editable scorecard criteria from a job description text.
   * Returns a suggested set of criteria that the recruiter can edit.
   */
  extractScorecard(jdText: string): Promise<Omit<ScorecardCriterion, 'id'>[]>
}

// ─── Vision provider (scanned PDFs) ──────────────────────────────────────────

/**
 * Some providers also support vision (image-to-text) for scanned PDFs.
 * The ingestion service checks for this capability before falling back.
 */
export interface VisionCapableLLMProvider extends LLMProvider {
  readonly supportsVision: true
  /**
   * Extract text from a scanned PDF page image (base64-encoded).
   * Returns the extracted text, or null if extraction failed.
   */
  extractTextFromImage(base64Image: string, mimeType: string): Promise<string | null>
}

export function isVisionCapable(p: LLMProvider): p is VisionCapableLLMProvider {
  return 'supportsVision' in p && p.supportsVision === true
}
