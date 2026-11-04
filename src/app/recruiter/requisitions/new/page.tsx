import { listClients } from '@/lib/queries/recruiter'
import { requireStaff } from '@/lib/session'
import { NewRequisitionForm } from './new-requisition-form'

export default async function NewRequisitionPage() {
  await requireStaff()
  const clients = await listClients()
  return (
    <>
      <h1 className="mb-2 text-3xl">New requisition</h1>
      <p className="mb-6 max-w-xl text-[var(--color-muted)]">
        Paste the job description. We propose a scorecard; you edit it before any CV is scored.
      </p>
      <NewRequisitionForm clients={clients} />
    </>
  )
}
