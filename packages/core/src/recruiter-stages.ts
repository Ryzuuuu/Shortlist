/**
 * packages/core/src/recruiter-stages.ts
 *
 * Which pipeline moves a RECRUITER may make by hand. The other moves belong to
 * other actors, so the stages stay honest about who decided what:
 *   sourced -> screened   happens when the recruiter opens the CV
 *   screened -> submitted the Submit button (which also needs the CV opened)
 *   submitted -> shortlisted, shortlisted -> interview   the client
 *   interview -> offered, offered -> joined               the recruiter (here)
 *   any open stage -> rejected                            the recruiter (here) or the client
 */
import { canTransition, isTerminal, type PipelineStage } from './pipeline'

const RECRUITER_FORWARD: Partial<Record<PipelineStage, PipelineStage>> = {
  interview: 'offered',
  offered: 'joined',
}

export type RecruiterMove = { to: 'offered' | 'joined' | 'rejected'; label: string }

const LABEL: Record<'offered' | 'joined' | 'rejected', string> = {
  offered: 'Mark offer made',
  joined: 'Mark joined',
  rejected: 'Reject',
}

/** The moves a recruiter can make from this stage (empty once a candidate has joined or been rejected). */
export function recruiterMoves(stage: PipelineStage): RecruiterMove[] {
  if (isTerminal(stage)) return []
  const moves: RecruiterMove[] = []
  const forward = RECRUITER_FORWARD[stage]
  if (forward === 'offered' || forward === 'joined') moves.push({ to: forward, label: LABEL[forward] })
  if (canTransition(stage, 'rejected')) moves.push({ to: 'rejected', label: LABEL.rejected })
  return moves
}

export function canRecruiterMove(from: PipelineStage, to: PipelineStage): boolean {
  return recruiterMoves(from).some((m) => m.to === to)
}

/** Display order of the board's columns. Rejected is shown apart from the funnel. */
export const PIPELINE_STAGES: readonly PipelineStage[] = [
  'sourced',
  'screened',
  'submitted',
  'shortlisted',
  'interview',
  'offered',
  'joined',
]
