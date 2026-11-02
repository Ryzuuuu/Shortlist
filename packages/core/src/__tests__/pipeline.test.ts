import { describe, it, expect } from 'vitest'
import { canTransition, transition, nextStages, isTerminal } from '../pipeline'
import type { PipelineStage } from '../pipeline'

describe('canTransition', () => {
  it('allows forward transitions along the chain', () => {
    expect(canTransition('sourced', 'screened')).toBe(true)
    expect(canTransition('screened', 'submitted')).toBe(true)
    expect(canTransition('submitted', 'shortlisted')).toBe(true)
    expect(canTransition('shortlisted', 'interview')).toBe(true)
    expect(canTransition('interview', 'offered')).toBe(true)
    expect(canTransition('offered', 'joined')).toBe(true)
  })

  it('allows rejection from any non-terminal stage', () => {
    const stages: PipelineStage[] = ['sourced', 'screened', 'submitted', 'shortlisted', 'interview', 'offered']
    for (const stage of stages) {
      expect(canTransition(stage, 'rejected'), `${stage} → rejected`).toBe(true)
    }
  })

  it('disallows backward transitions', () => {
    expect(canTransition('screened', 'sourced')).toBe(false)
    expect(canTransition('submitted', 'screened')).toBe(false)
    expect(canTransition('shortlisted', 'submitted')).toBe(false)
  })

  it('disallows skipping stages', () => {
    expect(canTransition('sourced', 'submitted')).toBe(false)
    expect(canTransition('sourced', 'shortlisted')).toBe(false)
    expect(canTransition('screened', 'shortlisted')).toBe(false)
  })

  it('disallows transitions from joined (terminal)', () => {
    expect(canTransition('joined', 'offered')).toBe(false)
    expect(canTransition('joined', 'rejected')).toBe(false)
  })

  it('disallows transitions from rejected (terminal)', () => {
    expect(canTransition('rejected', 'sourced')).toBe(false)
    expect(canTransition('rejected', 'screened')).toBe(false)
  })
})

describe('transition', () => {
  it('returns ok=true and newStage for valid transition', () => {
    const result = transition('sourced', 'screened')
    expect(result.ok).toBe(true)
    expect(result.newStage).toBe('screened')
  })

  it('returns ok=false for backward transition', () => {
    const result = transition('submitted', 'screened')
    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('returns ok=false when already in that stage', () => {
    const result = transition('sourced', 'sourced')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('Already')
  })

  it('returns ok=false for terminal stage transition', () => {
    const result = transition('joined', 'offered')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('terminal')
  })

  it('allows sourced → rejected', () => {
    const result = transition('sourced', 'rejected')
    expect(result.ok).toBe(true)
    expect(result.newStage).toBe('rejected')
  })
})

describe('nextStages', () => {
  it('returns the next stage and rejected from sourced', () => {
    const next = nextStages('sourced')
    expect(next).toContain('screened')
    expect(next).toContain('rejected')
  })

  it('returns only rejected from offered (before joined)', () => {
    const next = nextStages('offered')
    expect(next).toContain('joined')
    expect(next).toContain('rejected')
  })

  it('returns empty array from terminal states', () => {
    expect(nextStages('joined')).toHaveLength(0)
    expect(nextStages('rejected')).toHaveLength(0)
  })
})

describe('isTerminal', () => {
  it('identifies joined and rejected as terminal', () => {
    expect(isTerminal('joined')).toBe(true)
    expect(isTerminal('rejected')).toBe(true)
  })

  it('identifies non-terminal stages correctly', () => {
    const stages: PipelineStage[] = ['sourced', 'screened', 'submitted', 'shortlisted', 'interview', 'offered']
    for (const stage of stages) {
      expect(isTerminal(stage), stage).toBe(false)
    }
  })
})
