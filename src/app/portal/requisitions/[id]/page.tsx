import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireClient } from '@/lib/session'
import { getPortalCandidates, getPortalRequisition } from '@/lib/queries/portal'
import { Badge, EmptyState } from '@/components/ui'

const STAGE: Record<string, { label: string; variant: 'default' | 'success' | 'muted' | 'warning' | 'outline' }> = {
  submitted: { label: 'To review', variant: 'default' },
  shortlisted: { label: 'Shortlisted', variant: 'success' },
  interview: { label: 'Interview proposed', variant: 'success' },
  offered: { label: 'Offered', variant: 'success' },
  joined: { label: 'Joined', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'muted' },
}

export default async function PortalRequisition({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user } = await requireClient()
  const requisition = await getPortalRequisition(id, user.clientId)
  if (!requisition) notFound()
  const candidates = await getPortalCandidates(id, user.clientId)

  return (
    <>
      <p className="text-sm text-[var(--color-muted)]">
        <Link href="/portal" className="hover:underline">
          ← Your roles
        </Link>
      </p>
      <h1 className="mb-3 text-3xl">{requisition.title}</h1>

      {candidates.length === 0 ? (
        <EmptyState title="No candidates yet" description="Your recruiter will send a shortlist here once CVs have been reviewed." />
      ) : (
        <ul className="flex flex-col gap-2">
          {candidates.map((c) => {
            const best = c.evidence.find((e) => e.quote && e.met !== 'no')
            const stage = STAGE[c.stage] ?? { label: c.stage, variant: 'outline' as const }
            return (
              <li key={c.candidateId}>
                <Link
                  href={`/portal/requisitions/${id}/candidates/${c.candidateId}`}
                  className="flex gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2"
                >
                  <span className="w-12 shrink-0 text-center">
                    <span className="block font-serif text-3xl leading-none">{Math.round(c.total)}</span>
                    <span className="text-xs text-[var(--color-muted)]">fit</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-1">
                      <span className="truncate font-medium">{c.name}</span>
                      <Badge variant={stage.variant}>{stage.label}</Badge>
                    </span>
                    <span className="block truncate text-sm text-[var(--color-muted)]">{c.headline}</span>
                    {best?.quote && <span className="mt-1 line-clamp-2 block text-sm">“{best.quote}”</span>}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
