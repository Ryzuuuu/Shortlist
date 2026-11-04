/**
 * scripts/seed/scorecard.ts
 *
 * The example JD from the brief (Senior Java Developer, 5-8 years, Spring Boot,
 * Noida, notice up to 60 days) and its scorecard. Shared by the seed script and
 * the tests that check how the brief's sample candidates are scored.
 */
import type { ScorecardCriterion } from '@/db/types'

export const JD_A =
  'Senior Java Developer, 5-8 years, Spring Boot, Noida, notice up to 60 days. ' +
  'Build and run microservices for banking back-office systems.'

/** Heuristic-friendly: descriptions are keyword lists the provider can find in a CV. */
export const CRITERIA_A: ScorecardCriterion[] = [
  { id: 'c-java', label: 'Java', description: 'Java development', weight: 0.25, mustHave: true },
  { id: 'c-spring', label: 'Spring Boot', description: 'Spring Boot services', weight: 0.25, mustHave: true },
  { id: 'c-micro', label: 'Microservices', description: 'microservices', weight: 0.2, mustHave: false },
  { id: 'c-rest', label: 'REST APIs', description: 'REST APIs Hibernate', weight: 0.15, mustHave: false },
  { id: 'c-senior', label: 'Seniority', description: 'Senior Developer', weight: 0.15, mustHave: false },
]
export const FILTERS_A = [
  { id: 'f-exp', label: 'Experience 5-8 years', type: 'years_experience_range', value: { min: 5, max: 8 } },
  { id: 'f-notice', label: 'Notice up to 60 days', type: 'max_notice_days', value: 60 },
  { id: 'f-loc', label: 'Location Noida', type: 'location', value: 'Noida' },
]
