/**
 * packages/core/src/success-metrics.ts
 *
 * The brief's success measures, as pure functions over data we already record:
 *   - shortlist within 48 hours for 80% of requisitions
 *   - client acceptance of submitted candidates up from 45% to 60%
 * (Screening time per requisition, down 60%, needs a baseline from the old process, which we do not have.)
 */

export const SHORTLIST_TARGET_HOURS = 48
export const SHORTLIST_TARGET_PCT = 80
export const ACCEPTANCE_BASELINE_PCT = 45
export const ACCEPTANCE_TARGET_PCT = 60

export interface RequisitionTiming {
  createdAt: Date
  /** When the first candidate was submitted to the client; null if none yet */
  firstSubmittedAt: Date | null
}

export interface Rate {
  /** How many met the measure */
  met: number
  /** How many are counted */
  total: number
  /** Whole percent; null when nothing is counted yet */
  pct: number | null
}

const rate = (met: number, total: number): Rate => ({ met, total, pct: total === 0 ? null : Math.round((met / total) * 100) })

/**
 * Share of requisitions whose first shortlist reached the client within `hours` of opening.
 * A requisition is counted once it has been submitted to, or has been open longer than
 * `hours` with nothing submitted (that one missed the window). Newer requisitions with no
 * submission are still inside their window and are not counted either way.
 */
export function shortlistTimeliness(reqs: RequisitionTiming[], now: Date, hours = SHORTLIST_TARGET_HOURS): Rate {
  const windowMs = hours * 3_600_000
  let met = 0
  let total = 0
  for (const r of reqs) {
    if (r.firstSubmittedAt) {
      total++
      if (r.firstSubmittedAt.getTime() - r.createdAt.getTime() <= windowMs) met++
    } else if (now.getTime() - r.createdAt.getTime() > windowMs) {
      total++
    }
  }
  return rate(met, total)
}

/** Share of client decisions that were a shortlist (rather than a rejection). */
export function clientAcceptance(actions: string[]): Rate {
  const accepted = actions.filter((a) => a === 'shortlist').length
  const decided = accepted + actions.filter((a) => a === 'reject').length
  return rate(accepted, decided)
}
