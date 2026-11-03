import { describe, it, expect } from 'vitest'
import { allowedClientActions, contactsVisible, isVisibleToClient, maskContactDetails } from '../client-view'
import type { PipelineStage } from '../pipeline'

describe('isVisibleToClient', () => {
  it('hides candidates the recruiter has not submitted', () => {
    for (const s of ['sourced', 'screened'] as PipelineStage[]) expect(isVisibleToClient(s)).toBe(false)
  })

  it('shows submitted and later stages', () => {
    for (const s of ['submitted', 'shortlisted', 'interview', 'offered', 'joined'] as PipelineStage[]) {
      expect(isVisibleToClient(s)).toBe(true)
    }
  })

  it('shows rejected only when the client did the rejecting', () => {
    expect(isVisibleToClient('rejected')).toBe(false)
    expect(isVisibleToClient('rejected', true)).toBe(true)
  })
})

describe('contactsVisible (A1)', () => {
  it('masks contacts until shortlisted', () => {
    expect(contactsVisible('submitted')).toBe(false)
    expect(contactsVisible('rejected')).toBe(false)
    expect(contactsVisible('shortlisted')).toBe(true)
    expect(contactsVisible('interview')).toBe(true)
  })
})

describe('allowedClientActions', () => {
  it('offers shortlist or reject on a submitted candidate', () => {
    expect(allowedClientActions('submitted')).toEqual(['shortlist', 'reject'])
  })
  it('offers an interview slot or reject once shortlisted', () => {
    expect(allowedClientActions('shortlisted')).toEqual(['propose_interview', 'reject'])
  })
  it('offers nothing in other stages', () => {
    expect(allowedClientActions('interview')).toEqual([])
    expect(allowedClientActions('rejected')).toEqual([])
  })
})

describe('maskContactDetails', () => {
  it('hides emails and phone numbers in free text', () => {
    const out = maskContactDetails('Reach me at a.b@example.com or +91 98765 43210 for Java work')
    expect(out).toBe('Reach me at [hidden] or [hidden] for Java work')
  })

  it('leaves short numbers such as years alone', () => {
    expect(maskContactDetails('6.5 years, notice 60 days, 2019-2023')).toBe('6.5 years, notice 60 days, 2019-2023')
  })
})
