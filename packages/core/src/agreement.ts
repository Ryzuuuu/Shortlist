/**
 * packages/core/src/agreement.ts
 *
 * Weekly AI-rank vs recruiter-choice comparison for the delivery head (A10).
 * Pure functions: ranking maths, IST week bounds and CSV serialisation.
 */

export interface RankedCandidate {
  candidateId: string
  total: number
}

export interface RankPosition extends RankedCandidate {
  /** Competition rank: 1 + the number of candidates scoring strictly higher */
  rank: number
}

export interface AgreementResult {
  /** Submitted candidates that have an AI score */
  submittedCount: number
  /** How many of them the AI also ranked in its top N (N = submittedCount) */
  agreedCount: number
  /** null when nothing was submitted */
  agreementPct: number | null
  /** Every submitted candidate with the AI's rank for them */
  submitted: RankPosition[]
  /** Submitted by the recruiter but ranked below the AI's top N */
  disagreements: RankPosition[]
  /** In the AI's top N but not submitted (context only; not part of the %) */
  notSubmittedInTopN: RankPosition[]
  scoredCount: number
}

/**
 * Compare the AI's ranking with the candidates the recruiter submitted.
 * A submitted candidate agrees if their score is at or above the Nth-best score,
 * where N is the number submitted. Ties at the cutoff count as inside, so a
 * recruiter is never marked wrong for choosing between equal scores.
 */
export function compareRanks(ranking: RankedCandidate[], submittedIds: ReadonlySet<string>): AgreementResult {
  const sorted = [...ranking].sort((a, b) => b.total - a.total || a.candidateId.localeCompare(b.candidateId))
  const positions: RankPosition[] = sorted.map((c) => ({
    ...c,
    rank: 1 + sorted.filter((o) => o.total > c.total).length,
  }))

  const submitted = positions.filter((p) => submittedIds.has(p.candidateId))
  const n = submitted.length
  if (n === 0) {
    return { submittedCount: 0, agreedCount: 0, agreementPct: null, submitted: [], disagreements: [], notSubmittedInTopN: [], scoredCount: positions.length }
  }

  const cutoff = (positions[n - 1] as RankPosition).total
  const disagreements = submitted.filter((p) => p.total < cutoff)
  const agreedCount = n - disagreements.length
  return {
    submittedCount: n,
    agreedCount,
    agreementPct: Math.round((agreedCount / n) * 100),
    submitted,
    disagreements,
    notSubmittedInTopN: positions.filter((p) => !submittedIds.has(p.candidateId) && p.total >= cutoff),
    scoredCount: positions.length,
  }
}

// ─── Weeks (India Standard Time, Monday to Sunday) ───────────────────────────

const IST_OFFSET_MS = 5.5 * 3_600_000
const DAY_MS = 86_400_000

/** Start (inclusive) and end (exclusive) of an IST Monday-Sunday week as UTC instants. */
export function weekBounds(reference: Date, weeksAgo = 0): { start: Date; end: Date } {
  const local = new Date(reference.getTime() + IST_OFFSET_MS)
  const daysSinceMonday = (local.getUTCDay() + 6) % 7
  const localMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())
  const startMs = localMidnight - daysSinceMonday * DAY_MS - weeksAgo * 7 * DAY_MS - IST_OFFSET_MS
  return { start: new Date(startMs), end: new Date(startMs + 7 * DAY_MS) }
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

export type CsvCell = string | number | boolean | null

/**
 * RFC 4180 quoting, plus a guard for spreadsheet formula injection: text that
 * starts with = + - @ (or a tab/CR) is prefixed with an apostrophe so Excel
 * shows it as text instead of running it. Candidate names are user-supplied.
 */
export function toCsv(rows: CsvCell[][]): string {
  const cell = (v: CsvCell): string => {
    if (v === null) return ''
    let s = String(v)
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}
