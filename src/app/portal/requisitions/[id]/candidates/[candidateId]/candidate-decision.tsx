'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui'
import type { ClientAction } from '@shortlist/core'
import { proposeInterview, recordClientView, rejectCandidate, shortlistCandidate, type PortalResult } from '../../../../actions'

const REASONS = ['Not enough relevant experience', 'Skills do not match the role', 'Salary or notice period', 'Location']

const fieldClass =
  'min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-base'

export function CandidateDecision({ requisitionId, candidateId, actions }: { requisitionId: string; candidateId: string; actions: ClientAction[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [mode, setMode] = useState<'reject' | 'slot' | null>(null)
  const [reason, setReason] = useState('')
  const [slot, setSlot] = useState('')
  const [error, setError] = useState<string | null>(null)
  const logged = useRef(false)
  const ids = { requisitionId, candidateId }

  useEffect(() => {
    if (logged.current) return
    logged.current = true
    void recordClientView(ids)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function run(fn: () => Promise<PortalResult>) {
    setError(null)
    startTransition(async () => {
      const r = await fn()
      if (r.ok) {
        setMode(null)
        router.refresh()
      } else setError(r.error)
    })
  }

  if (actions.length === 0) return null

  return (
    <section aria-label="Your decision" className="flex flex-col gap-4 pb-8">
      {mode === null && (
        <div className="flex flex-col gap-4 sm:flex-row">
          {actions.includes('shortlist') && (
            <Button size="lg" className="min-h-11 flex-1" disabled={pending} onClick={() => run(() => shortlistCandidate(ids))}>
              {pending ? 'Saving…' : 'Shortlist'}
            </Button>
          )}
          {actions.includes('propose_interview') && (
            <Button size="lg" className="min-h-11 flex-1" onClick={() => setMode('slot')}>
              Propose interview time
            </Button>
          )}
          {actions.includes('reject') && (
            <Button size="lg" variant="outline" className="min-h-11 flex-1" onClick={() => setMode('reject')}>
              Reject
            </Button>
          )}
        </div>
      )}

      {mode === 'reject' && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            run(() => rejectCandidate({ ...ids, reason }))
          }}
        >
          <label className="flex flex-col gap-2 text-sm">
            Reason for rejecting (shared with your recruiter)
            <textarea className={`${fieldClass} min-h-24`} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <button key={r} type="button" className="min-h-9 rounded-full border border-[var(--color-border)] px-4 text-sm" onClick={() => setReason(r)}>
                {r}
              </button>
            ))}
          </div>
          <div className="flex gap-4">
            <Button type="submit" className="min-h-11 flex-1" disabled={pending || reason.trim().length < 3}>
              {pending ? 'Saving…' : 'Confirm rejection'}
            </Button>
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => setMode(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {mode === 'slot' && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            // datetime-local has no zone; the portal works in India Standard Time.
            run(() => proposeInterview({ ...ids, slot: `${slot}:00+05:30` }))
          }}
        >
          <label className="flex flex-col gap-2 text-sm">
            Proposed date and time (IST)
            <input type="datetime-local" className={fieldClass} value={slot} onChange={(e) => setSlot(e.target.value)} required />
          </label>
          <div className="flex gap-4">
            <Button type="submit" className="min-h-11 flex-1" disabled={pending || !slot}>
              {pending ? 'Saving…' : 'Send proposal'}
            </Button>
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => setMode(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {error}
        </p>
      )}
    </section>
  )
}
