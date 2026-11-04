'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PIPELINE_STAGES, recruiterMoves, type PipelineStage } from '@shortlist/core'
import { Badge, Button } from '@/components/ui'
import type { PipelineCard } from '@/lib/queries/recruiter'
import { advanceStage } from './actions'

const TITLE: Record<PipelineStage, string> = {
  sourced: 'Sourced',
  screened: 'Screened',
  submitted: 'Submitted',
  shortlisted: 'Shortlisted',
  interview: 'Interview',
  offered: 'Offered',
  joined: 'Joined',
  rejected: 'Rejected',
}

/** Who moves a candidate out of each stage, so the board explains itself. */
const OWNER: Partial<Record<PipelineStage, string>> = {
  sourced: 'Opens the CV',
  screened: 'You submit',
  submitted: 'Client decides',
  shortlisted: 'Client proposes a time',
}

export function PipelineBoard({ requisitionId, cards }: { requisitionId: string; cards: PipelineCard[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  function move(candidateId: string, to: 'offered' | 'joined' | 'rejected', why?: string) {
    setError(null)
    startTransition(async () => {
      const r = await advanceStage({ requisitionId, candidateId, to, reason: why })
      if (r.ok) {
        setRejecting(null)
        setReason('')
        router.refresh()
      } else setError(r.error)
    })
  }

  const byStage = (s: PipelineStage) => cards.filter((c) => c.stage === s)
  const rejected = byStage('rejected')

  return (
    <div>
      {error && (
        <p role="alert" className="mb-4 text-sm text-[var(--color-error)]">
          {error}
        </p>
      )}

      <div className="flex gap-4 overflow-x-auto pb-4" role="list" aria-label="Pipeline stages">
        {PIPELINE_STAGES.map((stage) => {
          const inStage = byStage(stage)
          return (
            <section key={stage} role="listitem" aria-label={`${TITLE[stage]}, ${inStage.length} candidates`} className="w-64 shrink-0">
              <header className="mb-2 flex items-baseline justify-between border-b border-[var(--color-border)] pb-2">
                <h2 className="font-sans text-sm font-medium">{TITLE[stage]}</h2>
                <span className="text-sm text-[var(--color-muted)]">{inStage.length}</span>
              </header>
              {OWNER[stage] && <p className="mb-2 text-xs text-[var(--color-muted)]">{OWNER[stage]}</p>}

              {inStage.length === 0 ? (
                <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-4 text-center text-xs text-[var(--color-muted)]">None</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {inStage.map((c) => {
                    const moves = recruiterMoves(c.stage).filter((m) => m.to !== 'rejected')
                    return (
                      <li key={c.candidateId} className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                        <Link href={`/recruiter/requisitions/${requisitionId}/candidates/${c.candidateId}`} className="block hover:underline">
                          <span className="block text-sm font-medium">{c.name}</span>
                        </Link>
                        <span className="block truncate text-xs text-[var(--color-muted)]">{c.headline}</span>
                        <span className="mt-2 flex items-center gap-2 text-xs">
                          <span className="font-serif text-base">{Math.round(c.total)}</span>
                          {c.isBelowFit && <Badge variant="muted">Below fit</Badge>}
                        </span>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {moves.map((m) => (
                            <Button key={m.to} size="sm" disabled={pending} onClick={() => move(c.candidateId, m.to as 'offered' | 'joined')}>
                              {m.label}
                            </Button>
                          ))}
                          {recruiterMoves(c.stage).some((m) => m.to === 'rejected') && (
                            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setRejecting(rejecting === c.candidateId ? null : c.candidateId)}>
                              Reject
                            </Button>
                          )}
                        </div>
                        {rejecting === c.candidateId && (
                          <form
                            className="mt-2 flex flex-col gap-2"
                            onSubmit={(e) => {
                              e.preventDefault()
                              move(c.candidateId, 'rejected', reason)
                            }}
                          >
                            <label className="flex flex-col gap-2 text-xs">
                              Reason (internal; the client never sees it)
                              <input
                                className="h-8 rounded-[var(--radius-md)] border border-[var(--color-border)] px-2 text-sm"
                                value={reason}
                                maxLength={500}
                                onChange={(e) => setReason(e.target.value)}
                                autoFocus
                              />
                            </label>
                            <Button type="submit" size="sm" disabled={pending || reason.trim().length < 3}>
                              Confirm rejection
                            </Button>
                          </form>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )
        })}
      </div>

      {rejected.length > 0 && (
        <section aria-label="Rejected" className="mt-6">
          <h2 className="mb-2 font-sans text-sm font-medium">
            Rejected <span className="text-[var(--color-muted)]">({rejected.length})</span>
          </h2>
          <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            {rejected.map((c) => (
              <li key={c.candidateId} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2 text-sm">
                <Link href={`/recruiter/requisitions/${requisitionId}/candidates/${c.candidateId}`} className="font-medium hover:underline">
                  {c.name}
                </Link>
                <span className="text-[var(--color-muted)]">{c.rejectionReason ?? 'No reason recorded'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
