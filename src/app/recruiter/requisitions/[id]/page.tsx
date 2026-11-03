import Link from 'next/link'
import { notFound } from 'next/navigation'
import { can } from '@shortlist/core'
import { requireStaff } from '@/lib/session'
import { getAttentionFiles, getLatestScorecard, getRanking, getRequisition, type RankedRow } from '@/lib/queries/recruiter'
import { Badge, EmptyState, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui'
import { AttentionList } from './attention-list'
import { UploadZone } from './upload-zone'

const MARK = { yes: '✓', partial: '~', no: '✗', unknown: '?' } as const
const MARK_WORD = { yes: 'Met', partial: 'Partly met', no: 'Not met', unknown: 'Unknown' } as const

/** The one action this row needs from the recruiter. */
function nextAction(r: RankedRow): { label: string; emphasis: boolean } {
  if (r.stage === 'sourced' || r.stage === 'screened') {
    return r.opened ? { label: 'Submit to client', emphasis: true } : { label: 'Open CV', emphasis: true }
  }
  return { label: r.stage.replace('_', ' '), emphasis: false }
}

export default async function RequisitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user } = await requireStaff()
  if (!can(user, 'requisition:read', { type: 'requisition' })) notFound()

  const requisition = await getRequisition(id)
  if (!requisition) notFound()

  const [scorecard, ranking, attention] = await Promise.all([getLatestScorecard(id), getRanking(id), getAttentionFiles(id)])
  const labels = new Map(scorecard?.criteria.map((c) => [c.id, c.label]))
  const weights = new Map(scorecard?.criteria.map((c) => [c.id, c.weight]))

  return (
    <>
      <p className="text-sm text-[var(--color-muted)]">
        <Link href="/recruiter" className="hover:underline">
          Requisitions
        </Link>{' '}
        / {requisition.clientName}
      </p>
      <h1 className="mb-3 text-3xl">{requisition.title}</h1>

      <UploadZone requisitionId={id} />
      {attention.length > 0 && <AttentionList files={attention} />}

      {ranking.length === 0 ? (
        <EmptyState
          title="No candidates scored yet"
          description="Upload CVs above. The best fits appear here first, each with the evidence quoted from the CV."
        />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Evidence</TableHead>
                <TableHead>Next action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranking.map((r, i) => {
                const action = nextAction(r)
                const best = [...r.results]
                  .filter((c) => c.quote && c.effectiveMet !== 'no')
                  .sort((a, b) => (weights.get(b.criterionId) ?? 0) - (weights.get(a.criterionId) ?? 0))[0]
                return (
                  <TableRow key={r.candidateId}>
                    <TableCell className="min-w-48 align-top">
                      <span className="text-xs text-[var(--color-muted)]">#{i + 1}</span>
                      <span className="block font-medium">{r.name}</span>
                      <span className="block text-sm text-[var(--color-muted)]">{r.headline}</span>
                      {r.isBelowFit && (
                        <Badge variant="muted" className="mt-1">
                          Below fit
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <span className="font-serif text-2xl">{Math.round(r.total)}</span>
                      <span className="text-sm text-[var(--color-muted)]">/100</span>
                    </TableCell>
                    <TableCell className="min-w-72 align-top">
                      <ul className="flex flex-wrap gap-x-2 gap-y-0.5 text-sm">
                        {r.results.map((c) => (
                          <li key={c.criterionId} title={MARK_WORD[c.effectiveMet]}>
                            <span aria-hidden>{MARK[c.effectiveMet]}</span>
                            <span className="sr-only">{MARK_WORD[c.effectiveMet]}: </span> {labels.get(c.criterionId) ?? c.criterionId}
                            {c.evidenceStatus === 'unverified' && <span className="text-[var(--color-warning)]"> (unverified)</span>}
                          </li>
                        ))}
                      </ul>
                      {best?.quote && (
                        <p className="mt-1 line-clamp-2 text-sm text-[var(--color-muted)]">“{best.quote}”</p>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <Link
                        href={`/recruiter/requisitions/${id}/candidates/${r.candidateId}`}
                        className={action.emphasis ? 'font-medium text-[var(--color-accent)] hover:underline' : 'text-sm capitalize text-[var(--color-muted)] hover:underline'}
                      >
                        {action.label}
                      </Link>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}
