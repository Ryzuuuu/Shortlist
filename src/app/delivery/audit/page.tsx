import Link from 'next/link'
import { redirect } from 'next/navigation'
import { can } from '@shortlist/core'
import { requireStaff } from '@/lib/session'
import { listAuditEntries } from '@/lib/queries/audit'
import { ButtonLink } from '@/components/button-link'
import { EmptyState, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui'

const ACTION: Record<string, string> = {
  candidate_viewed: 'Recruiter viewed CV',
  candidate_submitted: 'Recruiter submitted to client',
  client_viewed: 'Client viewed candidate',
  client_shortlist: 'Client shortlisted',
  client_reject: 'Client rejected',
  client_propose_interview: 'Client proposed interview',
  candidate_deleted: 'Candidate data deleted (DPDP request)',
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { user } = await requireStaff()
  if (!can(user, 'audit:read', { type: 'insights' })) redirect('/recruiter')

  const page = Math.max(0, Number.parseInt((await searchParams).page ?? '0', 10) || 0)
  const { rows, hasMore } = await listAuditEntries(page)

  return (
    <>
      <h1 className="mb-1 text-3xl">Audit log</h1>
      <p className="mb-3 max-w-xl text-[var(--color-muted)]">Who viewed or changed which candidate, and when. Deleted candidates appear without a name.</p>

      {rows.length === 0 ? (
        <EmptyState title="Nothing logged yet" description="Views, submissions, client decisions and deletions appear here as they happen." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When (IST)</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>What</TableHead>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Requisition</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">
                      {r.at.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })}
                    </TableCell>
                    <TableCell>{r.actor}</TableCell>
                    <TableCell>{ACTION[r.action] ?? r.action}</TableCell>
                    <TableCell>{r.candidate}</TableCell>
                    <TableCell>{r.requisition}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <nav className="mt-2 flex items-center justify-between text-sm" aria-label="Pagination">
            {page > 0 ? (
              <ButtonLink variant="outline" size="sm" href={`/delivery/audit?page=${page - 1}`}>
                Newer
              </ButtonLink>
            ) : (
              <span />
            )}
            {hasMore && (
              <ButtonLink variant="outline" size="sm" href={`/delivery/audit?page=${page + 1}`}>
                Older
              </ButtonLink>
            )}
          </nav>
        </>
      )}
      <p className="mt-3 text-sm text-[var(--color-muted)]">
        <Link href="/recruiter" className="hover:underline">
          ← Back to requisitions
        </Link>
      </p>
    </>
  )
}
