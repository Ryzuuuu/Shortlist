/**
 * packages/core/src/score-calculator.ts
 *
 * AI Rule #1: The LLM ONLY returns per-criterion {met, quote, confidence}.
 * This module computes the deterministic weighted total score from those results.
 * The LLM never produces a total score.
 *
 * Scoring matrix:
 *   met='yes'     → 1.0 × weight
 *   met='partial' → 0.5 × weight
 *   met='no'      → 0.0 × weight
 *   met='unknown' → 0.0 × weight (treated conservatively)
 *
 * Total = sum(criterion scores) / sum(weights) × 100
 * Result is clamped to [0, 100] and rounded to 1 decimal place.
 *
 * Weights default to equal (1/N) if not explicitly set on the scorecard.
 * If a criterion is marked mustHave and met='no'|'unknown', isBelowFit=true
 * regardless of total score.
 */

export interface ScorecardCriterionInput {
  id: string
  /** 0–1; if all weights are 0 or missing, equal weights are used */
  weight: number
  mustHave: boolean
}

export type CriterionMet = 'yes' | 'partial' | 'no' | 'unknown'

export interface CriterionScoreInput {
  criterionId: string
  met: CriterionMet
  /** Whether the LLM quote was verified against the source text */
  verified: boolean
}

export interface ScoreResult {
  /** Weighted total, 0–100 */
  total: number
  /** True if any mustHave criterion is unmet */
  isBelowFit: boolean
  /** Per-criterion contribution for audit/display */
  breakdown: Array<{
    criterionId: string
    met: CriterionMet
    rawScore: number   // 0 | 0.5 | 1.0
    weighted: number   // rawScore × normalisedWeight
  }>
}

// ─── Met value → raw score ────────────────────────────────────────────────────

const MET_SCORES: Record<CriterionMet, number> = {
  yes: 1.0,
  partial: 0.5,
  no: 0.0,
  unknown: 0.0,
}

// ─── calculateScore ───────────────────────────────────────────────────────────

/**
 * Compute the deterministic weighted score for a candidate against a scorecard.
 *
 * @param criteria  - Scorecard criteria with weights and mustHave flags.
 * @param results   - Per-criterion LLM results (after quote verification).
 * @returns ScoreResult
 */
export function calculateScore(
  criteria: ScorecardCriterionInput[],
  results: CriterionScoreInput[],
): ScoreResult {
  if (criteria.length === 0) {
    return { total: 0, isBelowFit: false, breakdown: [] }
  }

  // Build a lookup from criterionId → result
  const resultMap = new Map<string, CriterionScoreInput>()
  for (const r of results) {
    resultMap.set(r.criterionId, r)
  }

  // Normalise weights — if all are 0, use equal weighting
  const totalWeight = criteria.reduce((sum, c) => sum + (c.weight ?? 0), 0)
  const useEqualWeights = totalWeight === 0
  const normWeight = useEqualWeights ? 1 / criteria.length : 1 / totalWeight

  let weightedSum = 0
  let isBelowFit = false
  const breakdown: ScoreResult['breakdown'] = []

  for (const criterion of criteria) {
    const result = resultMap.get(criterion.id)
    const met: CriterionMet = result?.met ?? 'unknown'
    const rawScore = MET_SCORES[met]
    const criterionWeight = useEqualWeights ? 1 : (criterion.weight ?? 0)
    const weighted = rawScore * criterionWeight * normWeight

    weightedSum += weighted

    // mustHave check — unmet mustHave → isBelowFit regardless of total
    if (criterion.mustHave && (met === 'no' || met === 'unknown')) {
      isBelowFit = true
    }

    breakdown.push({ criterionId: criterion.id, met, rawScore, weighted })
  }

  // Clamp and round to 1 decimal
  const total = Math.min(100, Math.max(0, Math.round(weightedSum * 1000) / 10))

  // Also flag below_fit if total is below 40 (threshold for "below fit" label)
  if (total < 40) isBelowFit = true

  return { total, isBelowFit, breakdown }
}
