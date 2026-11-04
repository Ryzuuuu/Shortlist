import Link from 'next/link'
import { ButtonLink } from '@/components/button-link'
import { can } from '@shortlist/core'
import { requireStaff } from '@/lib/session'
import { listRequisitions } from '@/lib/queries/recruiter'
import { EmptyState } from '@/components/ui'

export default async function RequisitionsPage() {
  const { user } = await requireStaff()
  if (!can(user, 'requisition:read', { type: 'requisition' })) return null
  const reqs = await listRequisitions()

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-3xl">Requisitions</h1>
        <ButtonLink href="/recruiter/requisitions/new">New requisition</ButtonLink>
      </div>

      {reqs.length === 0 ? (
        <EmptyState
          title="No requisitions yet"
          description="Paste a job description to create a scorecard, then upload CVs to see the best fits first."
          action={
            <ButtonLink href="/recruiter/requisitions/new">Create the first requisition</ButtonLink>
          }
        />
      ) : (
        <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          {reqs.map((r) => (
            <li key={r.id}>
              <Link
                href={`/recruiter/requisitions/${r.id}`}
                className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-[var(--color-bg)]"
              >
                <span>
                  <span className="block font-medium">{r.title}</span>
                  <span className="text-sm text-[var(--color-muted)]">{r.clientName}</span>
                </span>
                <span className="text-sm text-[var(--color-muted)]">{r.candidateCount} scored</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
