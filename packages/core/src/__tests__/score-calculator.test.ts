import { describe, it, expect } from 'vitest'
import { calculateScore, type ScorecardCriterionInput, type CriterionScoreInput } from '../score-calculator'

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const criteria: ScorecardCriterionInput[] = [
  { id: 'c1', weight: 0.5, mustHave: true },
  { id: 'c2', weight: 0.3, mustHave: false },
  { id: 'c3', weight: 0.2, mustHave: false },
]

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('calculateScore', () => {
  it('returns 100 when all criteria met=yes', () => {
    const results: CriterionScoreInput[] = [
      { criterionId: 'c1', met: 'yes', verified: true },
      { criterionId: 'c2', met: 'yes', verified: true },
      { criterionId: 'c3', met: 'yes', verified: true },
    ]
    const { total, isBelowFit } = calculateScore(criteria, results)
    expect(total).toBe(100)
    expect(isBelowFit).toBe(false)
  })

  it('returns 0 when all criteria met=no', () => {
    const results: CriterionScoreInput[] = [
      { criterionId: 'c1', met: 'no', verified: true },
      { criterionId: 'c2', met: 'no', verified: true },
      { criterionId: 'c3', met: 'no', verified: true },
    ]
    const { total, isBelowFit } = calculateScore(criteria, results)
    expect(total).toBe(0)
    expect(isBelowFit).toBe(true) // mustHave c1 is no → below fit
  })

  it('scores partial as 0.5', () => {
    const results: CriterionScoreInput[] = [
      { criterionId: 'c1', met: 'partial', verified: true },
      { criterionId: 'c2', met: 'partial', verified: true },
      { criterionId: 'c3', met: 'partial', verified: true },
    ]
    const { total } = calculateScore(criteria, results)
    expect(total).toBe(50)
  })

  it('weights criteria correctly', () => {
    // c1(0.5)=yes(1.0), c2(0.3)=no(0.0), c3(0.2)=yes(1.0)
    // total = (0.5×1 + 0.3×0 + 0.2×1) / 1.0 × 100 = 70
    const results: CriterionScoreInput[] = [
      { criterionId: 'c1', met: 'yes', verified: true },
      { criterionId: 'c2', met: 'no', verified: true },
      { criterionId: 'c3', met: 'yes', verified: true },
    ]
    const { total } = calculateScore(criteria, results)
    expect(total).toBe(70)
  })

  it('uses equal weights when all weights are 0', () => {
    const equalCriteria: ScorecardCriterionInput[] = [
      { id: 'a', weight: 0, mustHave: false },
      { id: 'b', weight: 0, mustHave: false },
      { id: 'c', weight: 0, mustHave: false },
    ]
    const results: CriterionScoreInput[] = [
      { criterionId: 'a', met: 'yes', verified: true },
      { criterionId: 'b', met: 'yes', verified: true },
      { criterionId: 'c', met: 'no', verified: true },
    ]
    const { total } = calculateScore(equalCriteria, results)
    // 2/3 met → ~66.7
    expect(total).toBeCloseTo(66.7, 0)
  })

  it('sets isBelowFit=true when mustHave criterion is not met', () => {
    const results: CriterionScoreInput[] = [
      { criterionId: 'c1', met: 'no', verified: true }, // mustHave!
      { criterionId: 'c2', met: 'yes', verified: true },
      { criterionId: 'c3', met: 'yes', verified: true },
    ]
    const { isBelowFit } = calculateScore(criteria, results)
    expect(isBelowFit).toBe(true)
  })

  it('sets isBelowFit=true when mustHave criterion is unknown', () => {
    const results: CriterionScoreInput[] = [
      { criterionId: 'c1', met: 'unknown', verified: false },
      { criterionId: 'c2', met: 'yes', verified: true },
      { criterionId: 'c3', met: 'yes', verified: true },
    ]
    const { isBelowFit } = calculateScore(criteria, results)
    expect(isBelowFit).toBe(true)
  })

  it('sets isBelowFit=true when total is below 40', () => {
    const results: CriterionScoreInput[] = [
      { criterionId: 'c1', met: 'no', verified: true },
      { criterionId: 'c2', met: 'partial', verified: true },
      { criterionId: 'c3', met: 'no', verified: true },
    ]
    const { total, isBelowFit } = calculateScore(criteria, results)
    expect(total).toBeLessThan(40)
    expect(isBelowFit).toBe(true)
  })

  it('handles missing criterion results as unknown', () => {
    // c3 has no result
    const results: CriterionScoreInput[] = [
      { criterionId: 'c1', met: 'yes', verified: true },
      { criterionId: 'c2', met: 'yes', verified: true },
    ]
    const { total } = calculateScore(criteria, results)
    // c3(0.2) is unknown(0) → total = (0.5 + 0.3) / 1.0 × 100 = 80
    expect(total).toBe(80)
  })

  it('returns zero total for empty criteria', () => {
    const { total, isBelowFit } = calculateScore([], [])
    expect(total).toBe(0)
    expect(isBelowFit).toBe(false)
  })

  it('includes a breakdown for each criterion', () => {
    const results: CriterionScoreInput[] = [
      { criterionId: 'c1', met: 'yes', verified: true },
      { criterionId: 'c2', met: 'partial', verified: true },
      { criterionId: 'c3', met: 'no', verified: true },
    ]
    const { breakdown } = calculateScore(criteria, results)
    expect(breakdown).toHaveLength(3)
    expect(breakdown[0].criterionId).toBe('c1')
    expect(breakdown[0].rawScore).toBe(1.0)
    expect(breakdown[1].rawScore).toBe(0.5)
    expect(breakdown[2].rawScore).toBe(0)
  })
})
