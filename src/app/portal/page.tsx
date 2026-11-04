import Link from 'next/link'
import { requireClient } from '@/lib/session'
import { listPortalRequisitions } from '@/lib/queries/portal'
import { Badge, EmptyState } from '@/components/ui'

export default async function PortalHome() {
  const { user } = await requireClient()
  const reqs = await listPortalRequisitions(user.clientId)

  return (
    <>
      <h1 className="mb-6 text-3xl">Your roles</h1>
      {reqs.length === 0 ? (
        <EmptyState title="No open roles" description="When your recruiter opens a role for you, it will appear here." />
      ) : (
        <ul className="flex flex-col gap-4">
          {reqs.map((r) => (
            <li key={r.id}>
              <Link
                href={`/portal/requisitions/${r.id}`}
                className="flex min-h-14 items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4"
              >
                <span className="font-medium">{r.title}</span>
                {r.awaitingReview > 0 ? (
                  <Badge>{r.awaitingReview} to review</Badge>
                ) : (
                  <span className="text-sm text-[var(--color-muted)]">{r.shortlisted} shortlisted</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
