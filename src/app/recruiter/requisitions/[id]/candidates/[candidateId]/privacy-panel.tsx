'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui'
import { requestCandidateDeletion } from './actions'

interface Props {
  requisitionId: string
  candidateId: string
  consentPurpose: string
  consentAt: string
  consentWithdrawnAt: string | null
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' })

/** Consent record (purpose: hiring only) and the DPDP deletion-on-request control. */
export function PrivacyPanel(p: Props) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function remove() {
    setError(null)
    startTransition(async () => {
      const r = await requestCandidateDeletion({ requisitionId: p.requisitionId, candidateId: p.candidateId })
      if (r.ok) {
        router.replace(`/recruiter/requisitions/${p.requisitionId}`)
        router.refresh()
      } else setError(r.error)
    })
  }

  return (
    <section aria-label="Consent and privacy" className="mt-8 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm">
      <h2 className="mb-2 font-sans text-sm font-medium">Consent and privacy</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <dt className="text-[var(--color-muted)]">Purpose</dt>
        <dd>{p.consentPurpose === 'hiring_evaluation' ? 'Hiring evaluation only' : p.consentPurpose}</dd>
        <dt className="text-[var(--color-muted)]">Recorded</dt>
        <dd>{fmt(p.consentAt)}</dd>
        <dt className="text-[var(--color-muted)]">Status</dt>
        <dd>{p.consentWithdrawnAt ? `Withdrawn ${fmt(p.consentWithdrawnAt)}` : 'Active'}</dd>
      </dl>

      {!confirming ? (
        <Button variant="outline" size="sm" className="mt-4" onClick={() => setConfirming(true)}>
          Delete candidate data (on request)
        </Button>
      ) : (
        <div className="mt-4 flex flex-col gap-2" role="alertdialog" aria-label="Confirm deletion">
          <p>
            This permanently deletes the profile, the CV files and the AI results for this candidate, in every requisition. It cannot be undone. Only an anonymised log entry remains.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={remove} disabled={pending}>
              {pending ? 'Deleting…' : 'Delete permanently'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[var(--color-error)]">
          {error}
        </p>
      )}
    </section>
  )
}
