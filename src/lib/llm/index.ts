/**
 * src/lib/llm/index.ts
 *
 * LLM provider factory + result caching.
 *
 * Cache strategy (AI Rule — cache LLM results by contentHash + scorecardVersion):
 *   - Before calling the LLM, check ai_review_samples for (contentHash, scorecardId).
 *   - On cache hit, return cached response with fromCache=true.
 *   - On cache miss, call the LLM and persist the result.
 *
 * Provider selection: LLM_PROVIDER env var → 'anthropic' | 'gemini' | 'heuristic'
 * Falls back to 'heuristic' if the env var is unset or if the key is missing.
 */
import { db } from '@/db'
import { aiReviewSamples } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import type { LLMProvider, LLMScoringRequest, LLMScoringResponse } from './types'
export type { LLMProvider, LLMScoringRequest, LLMScoringResponse, VisionCapableLLMProvider } from './types'
export { isVisionCapable } from './types'

// ─── Provider factory ─────────────────────────────────────────────────────────

let _provider: LLMProvider | null = null

/**
 * Get the active LLM provider singleton.
 * Respects LLM_PROVIDER env var; falls back to heuristic if key is missing.
 */
export async function getLLMProvider(): Promise<LLMProvider> {
  if (_provider) return _provider

  const requested = process.env.LLM_PROVIDER ?? 'heuristic'

  if (requested === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
    const { AnthropicProvider } = await import('./providers/anthropic')
    _provider = new AnthropicProvider()
  } else if (requested === 'gemini' && process.env.GEMINI_API_KEY) {
    const { GeminiProvider } = await import('./providers/gemini')
    _provider = new GeminiProvider()
  } else {
    const { HeuristicProvider } = await import('./providers/heuristic')
    _provider = new HeuristicProvider()
  }

  return _provider
}

// ─── Cached scoring ───────────────────────────────────────────────────────────

/**
 * Score a CV against a scorecard, using the DB cache to avoid redundant LLM calls.
 *
 * @param contentHash  - SHA-256 of original file bytes.
 * @param scorecardId  - ID of the specific scorecard version.
 * @param request      - The full scoring request (including redacted text + criteria).
 */
export async function scoreWithCache(
  contentHash: string,
  scorecardId: string,
  request: LLMScoringRequest,
): Promise<LLMScoringResponse> {
  // 1. Check cache
  const cached = await db
    .select()
    .from(aiReviewSamples)
    .where(
      and(
        eq(aiReviewSamples.contentHash, contentHash),
        eq(aiReviewSamples.scorecardId, scorecardId),
      ),
    )
    .limit(1)

  if (cached.length > 0 && cached[0]) {
    const row = cached[0]
    const rawResponse = row.rawResponse as LLMScoringResponse['criteria']
    return {
      criteria: rawResponse,
      provider: row.llmProvider,
      fromCache: true,
    }
  }

  // 2. Call the provider
  const provider = await getLLMProvider()
  const response = await provider.score(request)

  // 3. Persist to cache
  await db.insert(aiReviewSamples).values({
    id: createId(),
    contentHash,
    scorecardId,
    llmProvider: response.provider,
    rawResponse: response.criteria,
  }).onConflictDoNothing()

  return response
}
