/**
 * Shared TypeScript interfaces for jsonb columns in the Drizzle schema.
 * These are the source of truth for profile, criteria, and score shapes.
 */

// ─── Scorecard ────────────────────────────────────────────────────────────────

export interface ScorecardCriterion {
  id: string
  label: string
  description: string
  /** 0–1; defaults to 1/N for equal weighting */
  weight: number
  /** If true, failing this criterion flags the candidate regardless of total score */
  mustHave: boolean
}

export interface FilterRule {
  id: string
  label: string
  /** e.g. 'min_years_experience', 'required_certification' */
  type: string
  value: unknown
}

// ─── Candidate Profile ────────────────────────────────────────────────────────

export interface WorkHistoryEntry {
  company: string
  role: string
  startDate: string | null
  endDate: string | null // null = current
  description: string
}

export interface EducationEntry {
  institution: string
  degree: string
  field: string
  graduationYear: number | null
}

export interface CandidateProfile {
  firstName: string
  lastName: string
  /** Masked for clients until shortlisted — see ASSUMPTION A1 */
  email: string | null
  /** Masked for clients until shortlisted — see ASSUMPTION A1 */
  phone: string | null
  headline: string
  currentCompany: string | null
  currentRole: string | null
  location: string | null
  skills: string[]
  workHistory: WorkHistoryEntry[]
  education: EducationEntry[]
}

// ─── LLM / Scoring ────────────────────────────────────────────────────────────

export type CriterionMet = 'yes' | 'partial' | 'no' | 'unknown'

/**
 * Raw response from the LLM for a single criterion.
 * The LLM ONLY returns this — score is computed by deterministic code.
 */
export interface LLMCriterionResponse {
  criterionId: string
  met: CriterionMet
  /** Exact substring from the CV text (pre-redaction) */
  quote: string | null
  /** 0–1 */
  confidence: number
}

/**
 * After quote verification by packages/core/quoteVerifier.ts
 */
export interface CriterionScore {
  met: CriterionMet
  /** null if quote failed verification */
  quote: string | null
  confidence: number
  /** false if the quote was not found as a substring of rawText */
  verified: boolean
  /** Set when quote was dropped due to failed verification */
  unverifiedReason?: string
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export type PipelineStage =
  | 'sourced'
  | 'screened'
  | 'submitted'
  | 'shortlisted'
  | 'interview'
  | 'offered'
  | 'joined'
  | 'rejected'

// ─── Audit ────────────────────────────────────────────────────────────────────

export interface AuditMetadata {
  ipAddress?: string
  userAgent?: string
  previousStage?: PipelineStage
  newStage?: PipelineStage
  reason?: string
  [key: string]: unknown
}
