import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { can } from '@shortlist/core'
import { db } from '@/db'
import { candidates, scores } from '@/db/schema'
import type { CandidateProfile } from '@/db/types'
import { requireStaff } from '@/lib/session'
import { getLatestScorecard, getRequisition, type CriterionResult } from '@/lib/queries/recruiter'
import { CandidateReview } from './candidate-review'
import { PrivacyPanel } from './privacy-panel'
import { loadReviewState } from './review-state'

export default async function CandidatePage({ params }: { params: Promise<{ id: string; candidateId: string }> }) {
  const { id, candidateId } = await params
  const { user } = await requireStaff()
  if (!can(user, 'candidate:read', { type: 'candidate' })) notFound()

  const [requisition, scorecard] = await Promise.all([getRequisition(id), getLatestScorecard(id)])
  const [cand] = await db.select().from(candidates).where(eq(candidates.id, candidateId)).limit(1)
  const [score] = await db
    .select()
    .from(scores)
    .where(and(eq(scores.candidateId, candidateId), eq(scores.requisitionId, id)))
    .limit(1)
  if (!requisition || !scorecard || !cand || !score) notFound()

  const profile = cand.profile as CandidateProfile
  const state = await loadReviewState(id, candidateId)

  return (
    <>
      <p className="mb-1 text-sm text-[var(--color-muted)]">
        <Link href={`/recruiter/requisitions/${id}`} className="hover:underline">
          ← {requisition.title}
        </Link>
      </p>
      <CandidateReview
        requisitionId={id}
        candidateId={candidateId}
        name={`${profile.firstName} ${profile.lastName}`.trim() || 'Unnamed candidate'}
        headline={profile.headline}
        email={profile.email}
        phone={profile.phone}
        rawText={cand.rawText}
        total={score.total}
        isBelowFit={score.isBelowFit}
        provider={score.llmProvider}
        results={score.perCriterion as CriterionResult[]}
        criteria={scorecard.criteria.map((c) => ({ id: c.id, label: c.label, mustHave: c.mustHave }))}
        initialOpened={state.opened}
        stage={state.stage}
      />
      <PrivacyPanel
        requisitionId={id}
        candidateId={candidateId}
        consentPurpose={cand.consentPurpose}
        consentAt={cand.consentAt.toISOString()}
        consentWithdrawnAt={cand.consentWithdrawnAt?.toISOString() ?? null}
      />
    </>
  )
}
