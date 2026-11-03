import { toCsv, type CsvCell } from '@shortlist/core'
import type { WeeklyAgreement } from '@/lib/queries/agreement'

const istDate = (d: Date) => new Date(d.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10)

/** One row per submitted candidate, plus the AI's top-N picks that were not submitted. */
export function buildAgreementCsv(week: WeeklyAgreement, weekStart: Date): string {
  const header: CsvCell[] = ['week_start_ist', 'requisition', 'client', 'candidate', 'ai_rank', 'ai_score', 'type', 'requisition_agreement_pct']
  const rows: CsvCell[][] = [header]
  const start = istDate(weekStart)

  for (const r of week.rows) {
    const bad = new Set(r.result.disagreements.map((d) => d.candidateId))
    const line = (id: string, rank: number, total: number, type: string): CsvCell[] => [
      start, r.title, r.clientName, r.names[id] ?? 'Unnamed candidate', rank, total, type, r.result.agreementPct,
    ]
    for (const c of r.result.submitted) {
      rows.push(line(c.candidateId, c.rank, c.total, bad.has(c.candidateId) ? 'submitted_disagrees' : 'submitted_agrees'))
    }
    for (const c of r.result.notSubmittedInTopN) rows.push(line(c.candidateId, c.rank, c.total, 'not_submitted_in_ai_top_n'))
  }
  return toCsv(rows)
}
