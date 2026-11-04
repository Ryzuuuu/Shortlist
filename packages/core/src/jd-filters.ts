/**
 * packages/core/src/jd-filters.ts
 *
 * Deterministic extraction of hard filters (experience, notice, CTC) from JD
 * text, for the editable scorecard. Reads only what the JD states; anything
 * not stated is simply absent.
 */

import { findCity } from './skills'

export interface JdFilter {
  id: string
  label: string
  type: 'years_experience_range' | 'max_notice_days' | 'ctc_range_lpa' | 'location'
  value: unknown
}

const RANGE = String.raw`(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)`

export function extractJdFilters(jd: string): JdFilter[] {
  const out: JdFilter[] = []

  const years = jd.match(new RegExp(`${RANGE}\\s*\\+?\\s*(?:years?|yrs?)`, 'i'))
  const yearsMin = jd.match(/(\d+(?:\.\d+)?)\s*\+\s*(?:years?|yrs?)/i)
  if (years?.[1] && years[2]) {
    const min = Number(years[1])
    const max = Number(years[2])
    out.push({ id: 'f-exp', label: `Experience ${min}-${max} years`, type: 'years_experience_range', value: { min, max } })
  } else if (yearsMin?.[1]) {
    const min = Number(yearsMin[1])
    out.push({ id: 'f-exp', label: `Experience ${min}+ years`, type: 'years_experience_range', value: { min, max: null } })
  }

  const notice = jd.match(/notice(?:\s+period)?[^.\d\n]{0,25}?(\d{1,3})\s*(days?|months?)/i)
  if (notice?.[1] && notice[2]) {
    const days = /month/i.test(notice[2]) ? Number(notice[1]) * 30 : Number(notice[1])
    out.push({ id: 'f-notice', label: `Notice up to ${days} days`, type: 'max_notice_days', value: days })
  }

  const ctc = jd.match(new RegExp(`(?:ctc|salary|budget|compensation)[^\\d\\n]{0,25}${RANGE}\\s*(?:lpa|lakhs?)`, 'i'))
  if (ctc?.[1] && ctc[2]) {
    const min = Number(ctc[1])
    const max = Number(ctc[2])
    out.push({ id: 'f-ctc', label: `CTC ${min}-${max} LPA`, type: 'ctc_range_lpa', value: { min, max } })
  }

  const city = findCity(jd)
  if (city) out.push({ id: 'f-loc', label: `Location ${city}`, type: 'location', value: city })

  return out
}

// ─── Applying filters to a candidate ─────────────────────────────────────────

/** What the CV says about the candidate, any of which may be unknown. */
export interface CandidateFacts {
  experienceYears?: number | null
  noticeDays?: number | null
  ctcLpa?: number | null
  location?: string | null
}

export type FilterStatus = 'meets' | 'misses' | 'unknown'

export interface FilterCheck {
  id: string
  label: string
  status: FilterStatus
  /** Short human reading, e.g. "90 days (limit 60)" */
  detail: string
}

interface AnyFilter {
  id: string
  label: string
  type: string
  value: unknown
}

const isRange = (v: unknown): v is { min: number; max: number | null } =>
  typeof v === 'object' && v !== null && typeof (v as { min?: unknown }).min === 'number'

/**
 * Compare a candidate's stated facts with the JD's filters. These are labels for
 * the recruiter, never a verdict: nothing here rejects or hides a candidate
 * (AI rule 4), and a fact the CV does not state is "unknown", not a miss.
 * Filter types this function does not know are skipped.
 */
export function evaluateFilters(filters: AnyFilter[], facts: CandidateFacts): FilterCheck[] {
  const out: FilterCheck[] = []
  for (const f of filters) {
    if (f.type === 'years_experience_range' && isRange(f.value)) {
      const y = facts.experienceYears
      const want = f.value.max === null ? `${f.value.min}+ years` : `${f.value.min}-${f.value.max} years`
      if (y == null) out.push({ id: f.id, label: f.label, status: 'unknown', detail: `not stated (wanted ${want})` })
      else {
        const ok = y >= f.value.min && (f.value.max === null || y <= f.value.max)
        out.push({ id: f.id, label: f.label, status: ok ? 'meets' : 'misses', detail: `${y} years (wanted ${want})` })
      }
    } else if (f.type === 'max_notice_days' && typeof f.value === 'number') {
      const d = facts.noticeDays
      if (d == null) out.push({ id: f.id, label: f.label, status: 'unknown', detail: `not stated (limit ${f.value} days)` })
      else out.push({ id: f.id, label: f.label, status: d <= f.value ? 'meets' : 'misses', detail: d === 0 ? `immediate (limit ${f.value} days)` : `${d} days (limit ${f.value})` })
    } else if (f.type === 'ctc_range_lpa' && isRange(f.value)) {
      const c = facts.ctcLpa
      const max = f.value.max ?? f.value.min
      if (c == null) out.push({ id: f.id, label: f.label, status: 'unknown', detail: `not stated (budget up to ${max} LPA)` })
      else out.push({ id: f.id, label: f.label, status: c <= max ? 'meets' : 'misses', detail: `${c} LPA (budget up to ${max})` })
    } else if (f.type === 'location' && typeof f.value === 'string') {
      const loc = facts.location
      if (!loc) out.push({ id: f.id, label: f.label, status: 'unknown', detail: `not stated (wanted ${f.value})` })
      else out.push({ id: f.id, label: f.label, status: loc.toLowerCase().includes(f.value.toLowerCase()) ? 'meets' : 'misses', detail: `${loc} (wanted ${f.value})` })
    }
  }
  return out
}

/** Counts for a compact table cell: "2 of 3 filters met". */
export function summariseFilters(checks: FilterCheck[]): { meets: number; misses: number; unknown: number; total: number } {
  const count = (s: FilterStatus) => checks.filter((c) => c.status === s).length
  return { meets: count('meets'), misses: count('misses'), unknown: count('unknown'), total: checks.length }
}
