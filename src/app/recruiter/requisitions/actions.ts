'use server'

import { createId } from '@paralleldrive/cuid2'
import { z } from 'zod'
import { can, extractJdFilters, type JdFilter } from '@shortlist/core'
import { db } from '@/db'
import { requisitions, scorecards } from '@/db/schema'
import type { ScorecardCriterion } from '@/db/types'
import { getLLMProvider } from '@/lib/llm'
import { requireStaff } from '@/lib/session'

const JdSchema = z.string().trim().min(20, 'Paste the full job description (at least 20 characters).').max(20000)

const CriterionSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1, 'Every criterion needs a name.').max(120),
  description: z.string().trim().max(400),
  weight: z.number().min(0).max(100),
  mustHave: z.boolean(),
})

const FilterSchema = z.object({
  id: z.string(),
  label: z.string().max(120),
  type: z.string(),
  value: z.unknown(),
})

const CreateSchema = z.object({
  title: z.string().trim().min(2, 'Add a title.').max(160),
  clientId: z.string().min(1, 'Choose a client.'),
  jdText: JdSchema,
  criteria: z.array(CriterionSchema).min(1, 'Keep at least one criterion.').max(20),
  filters: z.array(FilterSchema).max(10),
})

export interface DraftScorecard {
  criteria: Array<Omit<ScorecardCriterion, 'weight'> & { weight: number }>
  filters: JdFilter[]
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

/** Weights as whole percentages summing to ~100; equal when the source gave none (ASSUMPTION A6). */
function toPercentWeights(weights: number[]): number[] {
  const total = weights.reduce((s, w) => s + w, 0)
  if (total <= 0) return weights.map(() => Math.round(100 / weights.length))
  return weights.map((w) => Math.round((w / total) * 100))
}

/** Step 1 of JD intake: propose an editable scorecard. Nothing is saved yet. */
export async function suggestScorecard(jdText: string): Promise<ActionResult<DraftScorecard>> {
  const { user } = await requireStaff()
  if (!can(user, 'requisition:write', { type: 'requisition' })) return { ok: false, error: 'Not allowed.' }

  const parsed = JdSchema.safeParse(jdText)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid job description.' }

  try {
    const provider = await getLLMProvider()
    const raw = await provider.extractScorecard(parsed.data)
    const percents = toPercentWeights(raw.map((c) => c.weight))
    const criteria = raw.map((c, i) => ({ ...c, id: createId(), weight: percents[i] ?? 0 }))
    return { ok: true, data: { criteria, filters: extractJdFilters(parsed.data) } }
  } catch {
    return { ok: false, error: 'Could not extract a scorecard. Add criteria by hand or try again.' }
  }
}

/** Step 2: persist the recruiter-edited scorecard as version 1 of a new requisition. */
export async function createRequisition(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { user } = await requireStaff()
  if (!can(user, 'requisition:write', { type: 'requisition' })) return { ok: false, error: 'Not allowed.' }

  const parsed = CreateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  const v = parsed.data

  // The UI edits weights as percentages; the scorecard stores 0-1.
  const total = v.criteria.reduce((s, c) => s + c.weight, 0)
  const criteria: ScorecardCriterion[] = v.criteria.map((c) => ({
    ...c,
    weight: total > 0 ? c.weight / total : 1 / v.criteria.length,
  }))

  const requisitionId = createId()
  await db.insert(requisitions).values({
    id: requisitionId,
    clientId: v.clientId,
    createdByUserId: user.id,
    title: v.title,
    jdText: v.jdText,
  })
  await db.insert(scorecards).values({
    id: createId(),
    requisitionId,
    version: 1,
    criteria,
    filters: v.filters,
  })
  return { ok: true, data: { id: requisitionId } }
}
