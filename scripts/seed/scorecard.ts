/**
 * scripts/seed/scorecard.ts
 *
 * The example JD from the brief (Senior Java Developer, 5-8 years, Spring Boot,
 * Noida, notice up to 60 days) and the scorecard THE PRODUCT ITSELF extracts from it.
 * Deriving it, rather than hand-writing it, means the demo shows the real JD-intake
 * flow. Shared by the seed script and the tests that check how the brief's sample
 * candidates are scored.
 */
import { extractJdCriteria, extractJdFilters } from '@shortlist/core'
import type { ScorecardCriterion } from '@/db/types'

export const JD_A =
  'Senior Java Developer, 5-8 years, Spring Boot, Noida, notice up to 60 days. ' +
  'Build and run microservices for banking back-office systems.'

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export const CRITERIA_A: ScorecardCriterion[] = extractJdCriteria(JD_A).map((c) => ({ id: `c-${slug(c.label)}`, ...c }))

export const FILTERS_A = extractJdFilters(JD_A)
