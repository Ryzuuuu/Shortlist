'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Badge, EmptyState, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui'
import type { RankedRow } from '@/lib/queries/recruiter'

const MARK = { yes: '✓', partial: '~', no: '✗', unknown: '?' } as const
const MARK_WORD = { yes: 'Met', partial: 'Partly met', no: 'Not met', unknown: 'Unknown' } as const

type Filter = 'all' | 'fit' | 'below' | 'review'

/** The one action this row needs from the recruiter. */
function nextAction(r: RankedRow): { label: string; emphasis: boolean } {
  if (r.stage === 'sourced' || r.stage === 'screened') {
    return r.opened ? { label: 'Submit to client', emphasis: true } : { label: 'Open CV', emphasis: true }
  }
  return { label: r.stage.replace('_', ' '), emphasis: false }
}

interface Props {
  requisitionId: string
  rows: RankedRow[]
  labels: Record<string, string>
  weights: Record<string, number>
}

export function RankingTable({ requisitionId, rows, labels, weights }: Props) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const counts = useMemo(
    () => ({
      all: rows.length,
      fit: rows.filter((r) => !r.isBelowFit).length,
      below: rows.filter((r) => r.isBelowFit).length,
      review: rows.filter((r) => r.needsReview).length,
    }),
    [rows],
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows
      .map((r, i) => ({ r, rank: i + 1 }))
      .filter(({ r }) => {
        if (filter === 'fit' && r.isBelowFit) return false
        if (filter === 'below' && !r.isBelowFit) return false
        if (filter === 'review' && !r.needsReview) return false
        if (!q) return true
        return `${r.name} ${r.headline} ${r.skills.join(' ')}`.toLowerCase().includes(q)
      })
  }, [rows, query, filter])

  const chips: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'fit', label: 'Fit' },
    { key: 'below', label: 'Below fit' },
    { key: 'review', label: 'Needs review' },
  ]

  return (
    <section aria-label="Ranked candidates">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <input
          type="search"
          aria-label="Search candidates by name, role or skill"
          placeholder="Search name, role or skill"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-10 w-full max-w-xs rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm"
        />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter candidates">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={filter === c.key}
              onClick={() => setFilter(c.key)}
              className={`min-h-8 rounded-full border px-4 text-sm ${
                filter === c.key ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-white' : 'border-[var(--color-border)] bg-[var(--color-surface)]'
              }`}
            >
              {c.label} <span className={filter === c.key ? 'opacity-80' : 'text-[var(--color-muted)]'}>{counts[c.key]}</span>
            </button>
          ))}
        </div>
        <p className="text-sm text-[var(--color-muted)]" aria-live="polite">
          Showing {visible.length} of {rows.length}
        </p>
      </div>

      {visible.length === 0 ? (
        <EmptyState title="No candidates match" description="Clear the search or choose a different filter. Nobody has been removed: low scorers stay here, labelled Below fit." />
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
              {visible.map(({ r, rank }) => {
                const action = nextAction(r)
                // Up to two different pieces of evidence, heaviest criteria first, so a row shows more than one reason.
                const quotes = [
                  ...new Set(
                    [...r.results]
                      .filter((c) => c.quote && c.effectiveMet !== 'no')
                      .sort((a, b) => (weights[b.criterionId] ?? 0) - (weights[a.criterionId] ?? 0))
                      .map((c) => c.quote as string),
                  ),
                ].slice(0, 2)
                const flagged = r.checks.filter((c) => c.status === 'misses')
                const unknown = r.checks.filter((c) => c.status === 'unknown')
                return (
                  <TableRow key={r.candidateId}>
                    <TableCell className="min-w-48 align-top">
                      <span className="text-xs text-[var(--color-muted)]">#{rank}</span>
                      <span className="block font-medium">{r.name}</span>
                      <span className="block text-sm text-[var(--color-muted)]">{r.headline}</span>
                      <span className="mt-2 flex flex-wrap gap-2">
                        {r.isBelowFit && <Badge variant="muted">Below fit</Badge>}
                        {r.needsReview && <Badge variant="warning">Needs review</Badge>}
                      </span>
                      {r.checks.length > 0 && (
                        <ul className="mt-2 text-xs" aria-label="Job description filters">
                          {flagged.map((c) => (
                            <li key={c.id} className="text-[var(--color-warning)]">
                              {c.detail}
                            </li>
                          ))}
                          {flagged.length === 0 && unknown.length === 0 && <li className="text-[var(--color-muted)]">Meets every JD filter</li>}
                          {unknown.length > 0 && <li className="text-[var(--color-muted)]">{unknown.length} not stated on the CV</li>}
                        </ul>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <span className="font-serif text-2xl">{Math.round(r.total)}</span>
                      <span className="text-sm text-[var(--color-muted)]">/100</span>
                    </TableCell>
                    <TableCell className="min-w-72 align-top">
                      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                        {r.results.map((c) => (
                          <li key={c.criterionId} title={MARK_WORD[c.effectiveMet]}>
                            <span aria-hidden>{MARK[c.effectiveMet]}</span>
                            <span className="sr-only">{MARK_WORD[c.effectiveMet]}: </span> {labels[c.criterionId] ?? c.criterionId}
                            {c.evidenceStatus === 'unverified' && <span className="text-[var(--color-warning)]"> (unverified)</span>}
                          </li>
                        ))}
                      </ul>
                      {quotes.map((q) => (
                        <p key={q} className="mt-2 line-clamp-1 text-sm text-[var(--color-muted)]">
                          “{q}”
                        </p>
                      ))}
                    </TableCell>
                    <TableCell className="align-top">
                      <Link
                        href={`/recruiter/requisitions/${requisitionId}/candidates/${r.candidateId}`}
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
    </section>
  )
}
