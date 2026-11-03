/**
 * packages/core/src/jd-filters.ts
 *
 * Deterministic extraction of hard filters (experience, notice, CTC) from JD
 * text, for the editable scorecard. Reads only what the JD states; anything
 * not stated is simply absent.
 */

export interface JdFilter {
  id: string
  label: string
  type: 'years_experience_range' | 'max_notice_days' | 'ctc_range_lpa'
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

  return out
}
