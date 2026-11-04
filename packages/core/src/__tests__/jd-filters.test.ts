import { describe, it, expect } from 'vitest'
import { evaluateFilters, extractJdFilters, summariseFilters } from '../jd-filters'

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

describe('evaluateFilters', () => {
  const filters = extractJdFilters('Senior Java Developer, 5-8 years, notice up to 60 days, Budget: 18 to 24 LPA')

  it('meets every filter for a matching candidate', () => {
    const checks = evaluateFilters(filters, { experienceYears: 6.5, noticeDays: 60, ctcLpa: 22 })
    expect(checks.map((c) => c.status)).toEqual(['meets', 'meets', 'meets'])
    expect(summariseFilters(checks)).toEqual({ meets: 3, misses: 0, unknown: 0, total: 3 })
  })

  it('labels misses with the reason, the limit boundaries being inclusive', () => {
    const checks = evaluateFilters(filters, { experienceYears: 4, noticeDays: 90, ctcLpa: 24 })
    expect(checks.map((c) => c.status)).toEqual(['misses', 'misses', 'meets'])
    expect(checks[0]?.detail).toBe('4 years (wanted 5-8 years)')
    expect(checks[1]?.detail).toBe('90 days (limit 60)')
    expect(evaluateFilters(filters, { experienceYears: 8, noticeDays: 60 })[0]?.status).toBe('meets')
  })

  it('treats facts the CV does not state as unknown, never as a miss', () => {
    const checks = evaluateFilters(filters, {})
    expect(checks.every((c) => c.status === 'unknown')).toBe(true)
  })

  it('reads an immediate joiner and open-ended experience', () => {
    expect(evaluateFilters(filters, { noticeDays: 0 }).find((c) => c.id === 'f-notice')?.detail).toBe('immediate (limit 60 days)')
    const open = extractJdFilters('8+ years in banking')
    expect(evaluateFilters(open, { experienceYears: 30 })[0]?.status).toBe('meets')
    expect(evaluateFilters(open, { experienceYears: 7 })[0]?.status).toBe('misses')
  })

  it('checks a location filter and skips filter types it does not know', () => {
    const f = [{ id: 'l', label: 'Noida', type: 'location', value: 'Noida' }, { id: 'x', label: '?', type: 'mystery', value: 1 }]
    expect(evaluateFilters(f, { location: 'Noida, Uttar Pradesh' })).toEqual([{ id: 'l', label: 'Noida', status: 'meets', detail: 'Noida, Uttar Pradesh (wanted Noida)' }])
    expect(evaluateFilters(f, { location: 'Pune' })[0]?.status).toBe('misses')
  })
})
