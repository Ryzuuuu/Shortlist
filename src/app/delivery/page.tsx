import { redirect } from 'next/navigation'
import { can, weekBounds } from '@shortlist/core'
import { requireStaff } from '@/lib/session'
import { getWeeklyAgreement } from '@/lib/queries/agreement'
import { ButtonLink } from '@/components/button-link'
import { EmptyState, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui'

const MAX_WEEKS_BACK = 52
const day = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })

export default async function DeliveryDashboard({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { user } = await requireStaff()
  if (!can(user, 'insights:read', { type: 'insights' })) redirect('/recruiter')

  const raw = Number.parseInt((await searchParams).week ?? '0', 10)
  const weeksAgo = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), MAX_WEEKS_BACK) : 0
  const { start, end } = weekBounds(new Date(), weeksAgo)
  const data = await getWeeklyAgreement(start, end)

  const disagreements = data.rows.flatMap((r) =>
    r.result.disagreements.map((d) => ({ ...d, name: r.names[d.candidateId] ?? 'Unnamed candidate', title: r.title, clientName: r.clientName, scored: r.result.scoredCount })),
  )
  const lastDay = new Date(end.getTime() - 1)

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-3xl">AI vs recruiter choices</h1>
          <p className="text-[var(--color-muted)]">
            Week of {day(start)} to {day(lastDay)}
          </p>
        </div>
        <nav className="flex items-center gap-1" aria-label="Week">
          {weeksAgo < MAX_WEEKS_BACK && (
            <ButtonLink variant="outline" size="sm" href={`/delivery?week=${weeksAgo + 1}`}>
              Earlier week
            </ButtonLink>
          )}
          {weeksAgo > 0 && (
            <ButtonLink variant="outline" size="sm" href={`/delivery?week=${weeksAgo - 1}`}>
              Later week
            </ButtonLink>
          )}
          <a
            href={`/api/delivery/agreement?week=${weeksAgo}`}
            download
            className="inline-flex h-8 items-center rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 text-xs font-medium text-white hover:bg-[var(--color-accent-hover)]"
          >
            Export CSV
          </a>
        </nav>
      </div>

      {data.rows.length === 0 ? (
        <EmptyState
          title="No submissions this week"
          description="When recruiters submit candidates to clients, the AI's ranking is compared with their choices here."
        />
      ) : (
        <>
          <dl className="mb-3 grid grid-cols-3 gap-2">
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
              <dt className="text-sm text-[var(--color-muted)]">Agreement</dt>
              <dd className="font-serif text-4xl">{data.agreementPct}%</dd>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
              <dt className="text-sm text-[var(--color-muted)]">Submitted</dt>
              <dd className="font-serif text-4xl">{data.submitted}</dd>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
              <dt className="text-sm text-[var(--color-muted)]">Disagreements</dt>
              <dd className="font-serif text-4xl">{disagreements.length}</dd>
            </div>
          </dl>
          <p className="mb-3 max-w-2xl text-sm text-[var(--color-muted)]">
            For each requisition, N candidates were submitted. A submission agrees with the AI if it ranks in the AI&apos;s top N (ties count). A disagreement is
            not an error by either side; it is a case worth a conversation.
          </p>

          <h2 className="mb-1 font-sans text-sm font-medium">By requisition</h2>
          <div className="mb-4 overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Requisition</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Agreement</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r) => (
                  <TableRow key={r.requisitionId}>
                    <TableCell className="font-medium">{r.title}</TableCell>
                    <TableCell>{r.clientName}</TableCell>
                    <TableCell>{r.result.submittedCount}</TableCell>
                    <TableCell>{r.result.agreementPct === null ? '—' : `${r.result.agreementPct}%`}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <h2 className="mb-1 font-sans text-sm font-medium">Disagreements</h2>
          {disagreements.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">None this week. Every submitted candidate was in the AI&apos;s top picks.</p>
          ) : (
            <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Requisition</TableHead>
                    <TableHead>AI rank</TableHead>
                    <TableHead>AI score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {disagreements.map((d) => (
                    <TableRow key={`${d.title}-${d.candidateId}`}>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell>
                        {d.title}
                        <span className="block text-xs text-[var(--color-muted)]">{d.clientName}</span>
                      </TableCell>
                      <TableCell>
                        #{d.rank} of {d.scored}
                      </TableCell>
                      <TableCell>{Math.round(d.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </>
  )
}
