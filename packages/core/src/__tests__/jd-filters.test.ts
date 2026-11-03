import { describe, it, expect } from 'vitest'
import { extractJdFilters } from '../jd-filters'

describe('extractJdFilters', () => {
  it('reads the brief example JD', () => {
    const f = extractJdFilters('Senior Java Developer, 5-8 years, Spring Boot, Noida, notice up to 60 days')
    expect(f).toEqual([
      { id: 'f-exp', label: 'Experience 5-8 years', type: 'years_experience_range', value: { min: 5, max: 8 } },
      { id: 'f-notice', label: 'Notice up to 60 days', type: 'max_notice_days', value: 60 },
    ])
  })

  it('reads CTC ranges and notice in months', () => {
    const f = extractJdFilters('Budget: 18 to 24 LPA. Notice period max 2 months.')
    expect(f.find((x) => x.type === 'ctc_range_lpa')?.value).toEqual({ min: 18, max: 24 })
    expect(f.find((x) => x.type === 'max_notice_days')?.value).toBe(60)
  })

  it('handles open-ended experience', () => {
    expect(extractJdFilters('8+ years in banking')[0]?.value).toEqual({ min: 8, max: null })
  })

  it('returns nothing when the JD states nothing', () => {
    expect(extractJdFilters('We need a great engineer.')).toEqual([])
  })
})
