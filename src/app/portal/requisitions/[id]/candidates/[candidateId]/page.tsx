import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireClient } from '@/lib/session'
import { getPortalCandidate } from '@/lib/queries/portal'
import { Badge } from '@/components/ui'
import { describeFacts } from '@/lib/format'
import { CandidateDecision } from './candidate-decision'

const MET = {
  yes: { word: 'Met', variant: 'success' },
  partial: { word: 'Partly met', variant: 'warning' },
  no: { word: 'Not met', variant: 'muted' },
  unknown: { word: 'Not shown in CV', variant: 'muted' },
} as const

export default async function PortalCandidate({ params }: { params: Promise<{ id: string; candidateId: string }> }) {
  const { id, candidateId } = await params
  const { user } = await requireClient()
  const c = await getPortalCandidate(id, candidateId, user.clientId)
  if (!c) notFound()

  return (
    <>
      <p className="text-sm text-[var(--color-muted)]">
        <Link href={`/portal/requisitions/${id}`} className="hover:underline">
          ← Candidates
        </Link>
      </p>

      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl">{c.name}</h1>
          <p className="text-[var(--color-muted)]">{c.headline}</p>
          <p className="text-sm text-[var(--color-muted)]">{[c.location, describeFacts(c.experienceYears, c.noticeDays)].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="text-right">
          <span className="block font-serif text-4xl leading-none">{Math.round(c.total)}</span>
          <span className="text-xs text-[var(--color-muted)]">fit score</span>
        </div>
      </header>

      {c.recruiterNote && (
        <p className="mb-6 rounded-[var(--radius-md)] bg-[var(--color-surface)] p-4 text-sm">
          <span className="font-medium">From your recruiter: </span>
          {c.recruiterNote}
        </p>
      )}

      <section className="mb-6">
        <h2 className="mb-2 font-sans text-sm font-medium text-[var(--color-muted)]">Why this candidate</h2>
        <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          {c.evidence.map((e) => (
            <li key={e.criterionId} className="p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{e.label}</span>
                <Badge variant={MET[e.met].variant}>{MET[e.met].word}</Badge>
              </div>
              {e.quote && <p className="mt-2 text-sm text-[var(--color-muted)]">“{e.quote}” <span className="text-xs">from the CV</span></p>}
            </li>
          ))}
        </ul>
      </section>

      {c.skills.length > 0 && (
        <p className="mb-6 text-sm">
          <span className="text-[var(--color-muted)]">Skills: </span>
          {c.skills.join(', ')}
        </p>
      )}

      <section className="mb-6 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-2 font-sans text-sm font-medium text-[var(--color-muted)]">Contact</h2>
        {c.contacts ? (
          <p className="text-sm">{[c.contacts.email, c.contacts.phone].filter(Boolean).join(' · ') || 'No contact details on file.'}</p>
        ) : (
          <p className="text-sm text-[var(--color-muted)]">Contact details are shared once you shortlist this candidate.</p>
        )}
      </section>

      {c.rejectionReason && <p className="mb-6 text-sm text-[var(--color-muted)]">You rejected this candidate: {c.rejectionReason}</p>}
      {c.proposedSlot && (
        <p className="mb-6 text-sm">
          Interview proposed for <time dateTime={c.proposedSlot}>{new Date(c.proposedSlot).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })}</time> IST.
        </p>
      )}

      <CandidateDecision requisitionId={id} candidateId={candidateId} actions={c.actions} />
    </>
  )
}
