'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { locateQuote } from '@shortlist/core'
import { Badge, Button } from '@/components/ui'
import type { CriterionResult } from '@/lib/queries/recruiter'
import { recordCvView, submitCandidate } from './actions'

interface Props {
  requisitionId: string
  candidateId: string
  name: string
  headline: string
  email: string | null
  phone: string | null
  rawText: string
  total: number
  isBelowFit: boolean
  provider: string
  results: CriterionResult[]
  criteria: Array<{ id: string; label: string; mustHave: boolean }>
  initialOpened: boolean
  stage: string
}

const MET = {
  yes: { word: 'Met', variant: 'success' },
  partial: { word: 'Partly met', variant: 'warning' },
  no: { word: 'Not met', variant: 'muted' },
  unknown: { word: 'Unknown', variant: 'muted' },
} as const

export function CandidateReview(p: Props) {
  const router = useRouter()
  const [opened, setOpened] = useState(p.initialOpened)
  const [stage, setStage] = useState(p.stage)
  const [active, setActive] = useState<string | null>(() => p.results.find((r) => r.quote)?.criterionId ?? null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const logged = useRef(false)
  const markRef = useRef<HTMLElement>(null)

  // Opening this page is what opens the CV: log it once, which unlocks Submit.
  useEffect(() => {
    if (logged.current) return
    logged.current = true
    void recordCvView({ requisitionId: p.requisitionId, candidateId: p.candidateId }).then((r) => {
      if (r.ok) setOpened(true)
      else setError(r.error)
    })
  }, [p.requisitionId, p.candidateId])

  const labelOf = useMemo(() => new Map(p.criteria.map((c) => [c.id, c])), [p.criteria])

  const span = useMemo(() => {
    const q = p.results.find((r) => r.criterionId === active)?.quote
    return locateQuote(q, p.rawText)
  }, [active, p.results, p.rawText])

  useEffect(() => {
    markRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [span])

  const canSubmit = opened && (stage === 'screened' || stage === 'sourced')
  const submitted = !['sourced', 'screened'].includes(stage)

  function submit() {
    setError(null)
    startTransition(async () => {
      const r = await submitCandidate({ requisitionId: p.requisitionId, candidateId: p.candidateId, note })
      if (r.ok) {
        setStage('submitted')
        router.refresh()
      } else setError(r.error)
    })
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Evidence panel first on small screens, right-hand on desktop */}
      <section className="order-1 flex flex-col gap-2 lg:order-2 lg:sticky lg:top-2 lg:max-h-[calc(100dvh-96px)] lg:self-start lg:overflow-y-auto">
        <header>
          <h1 className="text-3xl">{p.name}</h1>
          <p className="text-[var(--color-muted)]">{p.headline}</p>
          <p className="text-sm text-[var(--color-muted)]">{[p.email, p.phone].filter(Boolean).join(' · ')}</p>
        </header>

        <div className="flex items-baseline gap-1">
          <span className="font-serif text-5xl">{Math.round(p.total)}</span>
          <span className="text-[var(--color-muted)]">/100</span>
          {p.isBelowFit && <Badge variant="muted">Below fit</Badge>}
        </div>
        <p className="text-xs text-[var(--color-muted)]">
          Score is calculated from the checks below using the scorecard weights ({p.provider} reader). It never rejects anyone.
        </p>

        <ul className="flex flex-col divide-y divide-[var(--color-border)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          {p.results.map((r) => {
            const meta = labelOf.get(r.criterionId)
            const m = MET[r.effectiveMet]
            const isActive = r.criterionId === active
            return (
              <li key={r.criterionId} className={`px-2 py-1 ${isActive ? 'bg-[var(--color-bg)]' : ''}`}>
                <div className="flex items-center justify-between gap-1">
                  <span className="font-medium">
                    {meta?.label ?? r.criterionId}
                    {meta?.mustHave && <span className="ml-1 text-xs text-[var(--color-muted)]">must have</span>}
                  </span>
                  <Badge variant={m.variant}>{m.word}</Badge>
                </div>
                {r.quote ? (
                  <button
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setActive(r.criterionId)}
                    className="mt-1 text-left text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                  >
                    “{r.quote}” <span className="text-[var(--color-accent)]">Show in CV</span>
                  </button>
                ) : r.evidenceStatus === 'unverified' ? (
                  <p className="mt-1 text-sm text-[var(--color-warning)]">
                    The reader claimed a match, but its quote could not be found in the CV, so it is not shown or counted.
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-[var(--color-muted)]">No supporting text found in the CV.</p>
                )}
              </li>
            )
          })}
        </ul>

        {submitted ? (
          <p className="text-sm">
            Stage: <Badge variant="outline">{stage}</Badge>
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            <label className="flex flex-col gap-1 text-sm">
              Note for the client (optional)
              <textarea
                className="min-h-16 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1"
                value={note}
                maxLength={1000}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <div className="flex items-center gap-2">
              <Button onClick={submit} disabled={!canSubmit || pending}>
                {pending ? 'Submitting…' : 'Submit to client'}
              </Button>
              {!opened && <span className="text-sm text-[var(--color-muted)]">Recording that you opened the CV…</span>}
            </div>
            {p.isBelowFit && <p className="text-sm text-[var(--color-muted)]">This candidate scores below fit. Submitting is still your call.</p>}
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-[var(--color-error)]">
            {error}
          </p>
        )}
      </section>

      <section aria-label="CV text" className="order-2 lg:order-1">
        <h2 className="mb-1 font-sans text-sm font-medium text-[var(--color-muted)]">CV</h2>
        <div className="max-h-[70dvh] overflow-y-auto whitespace-pre-wrap rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm leading-6 lg:max-h-[calc(100dvh-128px)]">
          {span ? (
            <>
              {p.rawText.slice(0, span.start)}
              <mark ref={markRef} className="rounded-sm bg-[color-mix(in_srgb,var(--color-accent)_28%,transparent)] px-0.5 text-inherit">
                {p.rawText.slice(span.start, span.end)}
              </mark>
              {p.rawText.slice(span.end)}
            </>
          ) : (
            p.rawText
          )}
        </div>
      </section>
    </div>
  )
}
