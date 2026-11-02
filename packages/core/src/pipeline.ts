/**
 * packages/core/src/pipeline.ts
 *
 * Deterministic pipeline state machine for candidate stage transitions.
 *
 * Valid stages (in order):
 *   sourced → screened → submitted → shortlisted → interview → offered → joined
 *   Any stage → rejected  (terminal)
 *
 * Rules:
 *   1. Forward transitions must follow the ordered chain above.
 *   2. Backward transitions are never allowed (no un-submitting etc.).
 *   3. 'rejected' is a terminal state — no transitions out of it.
 *   4. 'joined' is a terminal state — no transitions out of it.
 *   5. Only specific roles may perform each transition (enforced by can() in
 *      the API layer; the state machine itself only validates stage logic).
 */

export type PipelineStage =
  | 'sourced'
  | 'screened'
  | 'submitted'
  | 'shortlisted'
  | 'interview'
  | 'offered'
  | 'joined'
  | 'rejected'

// Ordered forward chain (excludes terminal states reached via rejection)
const STAGE_ORDER: PipelineStage[] = [
  'sourced',
  'screened',
  'submitted',
  'shortlisted',
  'interview',
  'offered',
  'joined',
]

const TERMINAL: Set<PipelineStage> = new Set(['joined', 'rejected'])

/**
 * Returns true if `from` → `to` is a valid transition.
 *
 * @example
 * canTransition('screened', 'submitted') // true
 * canTransition('submitted', 'screened') // false — no backwards
 * canTransition('joined', 'offered')     // false — terminal
 * canTransition('sourced', 'rejected')   // true — any → rejected
 */
export function canTransition(from: PipelineStage, to: PipelineStage): boolean {
  // No transitions out of terminal states
  if (TERMINAL.has(from)) return false

  // Rejection is always allowed from any non-terminal state
  if (to === 'rejected') return true

  const fromIdx = STAGE_ORDER.indexOf(from)
  const toIdx = STAGE_ORDER.indexOf(to)

  if (fromIdx === -1 || toIdx === -1) return false

  // Must advance exactly to the next stage (no skipping)
  return toIdx === fromIdx + 1
}

export interface TransitionResult {
  ok: boolean
  error?: string
  newStage?: PipelineStage
}

/**
 * Attempt a stage transition. Returns ok=true with newStage, or ok=false with error.
 */
export function transition(
  currentStage: PipelineStage,
  targetStage: PipelineStage,
): TransitionResult {
  if (currentStage === targetStage) {
    return { ok: false, error: `Already in stage '${currentStage}'` }
  }

  if (TERMINAL.has(currentStage)) {
    return {
      ok: false,
      error: `Stage '${currentStage}' is terminal — no further transitions allowed`,
    }
  }

  if (!canTransition(currentStage, targetStage)) {
    return {
      ok: false,
      error: `Invalid transition: '${currentStage}' → '${targetStage}'`,
    }
  }

  return { ok: true, newStage: targetStage }
}

/**
 * Return all valid next stages from the current stage.
 */
export function nextStages(current: PipelineStage): PipelineStage[] {
  if (TERMINAL.has(current)) return []

  const idx = STAGE_ORDER.indexOf(current)
  const next: PipelineStage[] = []

  if (idx !== -1 && idx < STAGE_ORDER.length - 1) {
    next.push(STAGE_ORDER[idx + 1])
  }

  // rejected is always available from non-terminal stages
  next.push('rejected')

  return next
}

/** Returns true if the stage is terminal (joined or rejected). */
export function isTerminal(stage: PipelineStage): boolean {
  return TERMINAL.has(stage)
}
