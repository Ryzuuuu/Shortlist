import Link from 'next/link'
import { notFound } from 'next/navigation'
import { can } from '@shortlist/core'
import { requireStaff } from '@/lib/session'
import { getAttentionFiles, getLatestScorecard, getRanking, getRequisition } from '@/lib/queries/recruiter'
import { EmptyState } from '@/components/ui'
import { AttentionList } from './attention-list'
import { RankingTable } from './ranking-table'
import { RequisitionTabs } from './requisition-tabs'
import { UploadZone } from './upload-zone'

export default async function RequisitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user } = await requireStaff()
  if (!can(user, 'requisition:read', { type: 'requisition' })) notFound()

  const requisition = await getRequisition(id)
  if (!requisition) notFound()

  const scorecard = await getLatestScorecard(id)
  const [ranking, attention] = await Promise.all([getRanking(id, scorecard?.filters ?? []), getAttentionFiles(id)])
  const labels = Object.fromEntries((scorecard?.criteria ?? []).map((c) => [c.id, c.label]))
  const weights = Object.fromEntries((scorecard?.criteria ?? []).map((c) => [c.id, c.weight]))

  return (
    <>
      <p className="text-sm text-[var(--color-muted)]">
        <Link href="/recruiter" className="hover:underline">
          Requisitions
        </Link>{' '}
        / {requisition.clientName}
      </p>
      <h1 className="mb-6 text-3xl">{requisition.title}</h1>
      <RequisitionTabs id={id} active="ranked" />

      {scorecard && scorecard.filters.length > 0 && (
        <p className="mb-6 text-sm text-[var(--color-muted)]">
          JD filters: {scorecard.filters.map((f) => f.label).join(' · ')}. These label candidates; they never remove anyone.
        </p>
      )}

      <UploadZone requisitionId={id} />
      {attention.length > 0 && <AttentionList files={attention} />}

      {ranking.length === 0 ? (
        <EmptyState title="No candidates scored yet" description="Upload CVs above. The best fits appear here first, each with the evidence quoted from the CV." />
      ) : (
        <RankingTable requisitionId={id} rows={ranking} labels={labels} weights={weights} />
      )}
    </>
  )
}
