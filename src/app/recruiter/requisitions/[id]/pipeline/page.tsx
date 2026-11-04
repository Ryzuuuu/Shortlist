import Link from 'next/link'
import { notFound } from 'next/navigation'
import { can } from '@shortlist/core'
import { requireStaff } from '@/lib/session'
import { getPipeline, getRequisition } from '@/lib/queries/recruiter'
import { EmptyState } from '@/components/ui'
import { RequisitionTabs } from '../requisition-tabs'
import { PipelineBoard } from './pipeline-board'

export default async function PipelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user } = await requireStaff()
  if (!can(user, 'requisition:read', { type: 'requisition' })) notFound()

  const requisition = await getRequisition(id)
  if (!requisition) notFound()
  const cards = await getPipeline(id)

  return (
    <>
      <p className="text-sm text-[var(--color-muted)]">
        <Link href="/recruiter" className="hover:underline">
          Requisitions
        </Link>{' '}
        / {requisition.clientName}
      </p>
      <h1 className="mb-6 text-3xl">{requisition.title}</h1>
      <RequisitionTabs id={id} active="pipeline" />

      {cards.length === 0 ? (
        <EmptyState title="No candidates in the pipeline yet" description="Upload CVs on the ranked list. Every candidate enters at Sourced and moves right as you and the client act." />
      ) : (
        <PipelineBoard requisitionId={id} cards={cards} />
      )}
    </>
  )
}
