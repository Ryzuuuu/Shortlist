import { describe, expect, it } from 'vitest'
import { PIPELINE_STAGES, canRecruiterMove, recruiterMoves } from '../recruiter-stages'
import { transition, type PipelineStage } from '../pipeline'

const stages: PipelineStage[] = ['sourced', 'screened', 'submitted', 'shortlisted', 'interview', 'offered', 'joined', 'rejected']

describe('recruiterMoves', () => {
  it('lets a recruiter move interview -> offered -> joined, and reject at any open stage', () => {
    expect(recruiterMoves('interview').map((m) => m.to)).toEqual(['offered', 'rejected'])
    expect(recruiterMoves('offered').map((m) => m.to)).toEqual(['joined', 'rejected'])
    for (const s of ['sourced', 'screened', 'submitted', 'shortlisted'] as PipelineStage[]) {
      expect(recruiterMoves(s).map((m) => m.to)).toEqual(['rejected'])
    }
  })

  it('allows nothing once a candidate has joined or been rejected', () => {
    expect(recruiterMoves('joined')).toEqual([])
    expect(recruiterMoves('rejected')).toEqual([])
  })

  it('does not let a recruiter decide what belongs to the client or to the Submit button', () => {
    expect(canRecruiterMove('submitted', 'shortlisted')).toBe(false)
    expect(canRecruiterMove('shortlisted', 'interview')).toBe(false)
    expect(canRecruiterMove('screened', 'submitted')).toBe(false)
  })

  it('never offers a move the pipeline state machine would refuse', () => {
    for (const from of stages) {
      for (const m of recruiterMoves(from)) {
        expect(transition(from, m.to).ok, `${from} -> ${m.to}`).toBe(true)
      }
    }
  })

  it('does not skip stages', () => {
    expect(canRecruiterMove('interview', 'joined')).toBe(false)
    expect(canRecruiterMove('shortlisted', 'offered')).toBe(false)
  })
})

describe('PIPELINE_STAGES', () => {
  it('runs from sourced to joined, with rejected kept apart', () => {
    expect(PIPELINE_STAGES[0]).toBe('sourced')
    expect(PIPELINE_STAGES[PIPELINE_STAGES.length - 1]).toBe('joined')
    expect(PIPELINE_STAGES).not.toContain('rejected')
  })
})
