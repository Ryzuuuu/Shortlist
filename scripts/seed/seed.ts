/**
 * scripts/seed/seed.ts   —   npm run db:seed
 *
 * Idempotent demo seed. Roles are assigned here and only here (sign-up never
 * accepts a role). Runs the ~40 synthetic CVs through the real ingestion
 * pipeline with the local heuristic provider, so scores are precomputed with
 * no API key, then moves the top candidates along the pipeline for the demo.
 *
 * Demo accounts (local/demo use only): password comes from SEED_PASSWORD.
 */
import { and, desc, eq } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { db } from '@/db'
import { auth } from '@/lib/auth'
import { clients, cvFiles, pipelineEntries, requisitions, scorecards, scores, submissions, users } from '@/db/schema'
import type { ScorecardCriterion } from '@/db/types'
import { computeHash } from '@/lib/ingestion/parse'
import { processCvFile } from '@/lib/ingestion/process'
import { putFile } from '@/lib/ingestion/storage'
import { buildSeedCvs } from './cv-data'

const PASSWORD = process.env.SEED_PASSWORD ?? 'demo-password-123'

const IDS = {
  clientA: 'seed-client-meridian',
  clientB: 'seed-client-kestrel',
  reqA: 'seed-req-java-noida',
  reqB: 'seed-req-retail-analyst',
  scA: 'seed-sc-java-v1',
  scB: 'seed-sc-retail-v1',
}

const JD_A =
  'Senior Java Developer, 5-8 years, Spring Boot, Noida, notice up to 60 days. ' +
  'Build and run microservices for banking back-office systems.'

/** Heuristic-friendly: descriptions are keyword lists the provider can find in a CV. */
const CRITERIA_A: ScorecardCriterion[] = [
  { id: 'c-java', label: 'Java', description: 'Java development', weight: 0.25, mustHave: true },
  { id: 'c-spring', label: 'Spring Boot', description: 'Spring Boot services', weight: 0.25, mustHave: true },
  { id: 'c-micro', label: 'Microservices', description: 'microservices', weight: 0.2, mustHave: false },
  { id: 'c-rest', label: 'REST APIs', description: 'REST APIs Hibernate', weight: 0.15, mustHave: false },
  { id: 'c-senior', label: 'Seniority', description: 'Senior Developer', weight: 0.15, mustHave: false },
]
const FILTERS_A = [
  { id: 'f-exp', label: 'Experience 5-8 years', type: 'years_experience_range', value: { min: 5, max: 8 } },
  { id: 'f-notice', label: 'Notice up to 60 days', type: 'max_notice_days', value: 60 },
  { id: 'f-loc', label: 'Location Noida', type: 'location', value: 'Noida' },
]

async function ensureUser(email: string, name: string, role: 'recruiter' | 'client' | 'delivery_head', clientId: string | null) {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (!existing) {
    await auth.api.signUpEmail({ body: { email, password: PASSWORD, name } })
  }
  // Role is written directly: the sign-up body can never set it.
  await db.update(users).set({ role, clientId }).where(eq(users.email, email))
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (!row) throw new Error(`Could not create ${email}`)
  return row.id
}

async function main() {
  if (process.env.NODE_ENV === 'production' && !process.env.SEED_ALLOW_PRODUCTION) {
    throw new Error('Refusing to seed with NODE_ENV=production (set SEED_ALLOW_PRODUCTION to override)')
  }

  await db.insert(clients).values([
    { id: IDS.clientA, name: 'Meridian Bank Services', industry: 'Banking back-office' },
    { id: IDS.clientB, name: 'Kestrel Retail', industry: 'Retail' },
  ]).onConflictDoNothing()

  const recruiterId = await ensureUser('recruiter@shortlist.test', 'Demo Recruiter', 'recruiter', null)
  await ensureUser('head@shortlist.test', 'Demo Delivery Head', 'delivery_head', null)
  await ensureUser('client.meridian@shortlist.test', 'Meridian Hiring Manager', 'client', IDS.clientA)
  await ensureUser('client.kestrel@shortlist.test', 'Kestrel Hiring Manager', 'client', IDS.clientB)

  await db.insert(requisitions).values([
    { id: IDS.reqA, clientId: IDS.clientA, createdByUserId: recruiterId, title: 'Senior Java Developer (Noida)', jdText: JD_A },
    { id: IDS.reqB, clientId: IDS.clientB, createdByUserId: recruiterId, title: 'Retail Operations Analyst', jdText: 'Retail operations analyst, 2-4 years, Excel, reporting.' },
  ]).onConflictDoNothing()

  await db.insert(scorecards).values([
    { id: IDS.scA, requisitionId: IDS.reqA, version: 1, criteria: CRITERIA_A, filters: FILTERS_A },
    {
      id: IDS.scB,
      requisitionId: IDS.reqB,
      version: 1,
      criteria: [{ id: 'c-excel', label: 'Excel', description: 'Excel reporting', weight: 1, mustHave: true }],
      filters: null,
    },
  ]).onConflictDoNothing()

  // ── CVs through the real pipeline ───────────────────────────────────────────
  const cvs = await buildSeedCvs()
  const tally: Record<string, number> = {}
  for (const cv of cvs) {
    const hash = computeHash(cv.data)
    const [dupe] = await db.select({ id: cvFiles.id }).from(cvFiles)
      .where(and(eq(cvFiles.requisitionId, IDS.reqA), eq(cvFiles.contentHash, hash))).limit(1)
    if (dupe) continue

    const id = createId()
    const mime = cv.filename.endsWith('.docx')
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'application/pdf'
    await db.insert(cvFiles).values({
      id, requisitionId: IDS.reqA, uploadedByUserId: recruiterId,
      storageUrl: await putFile(id, cv.filename, cv.data),
      originalFilename: cv.filename, mimeType: mime, sizeBytes: cv.data.length, contentHash: hash,
    })
    const outcome = await processCvFile(id)
    tally[outcome] = (tally[outcome] ?? 0) + 1
  }

  // ── Demo pipeline state ─────────────────────────────────────────────────────
  const ranked = await db.select({ candidateId: scores.candidateId, total: scores.total, isBelowFit: scores.isBelowFit })
    .from(scores).where(eq(scores.requisitionId, IDS.reqA)).orderBy(desc(scores.total))

  const setStage = (candidateId: string, stage: 'screened' | 'submitted' | 'shortlisted') =>
    db.update(pipelineEntries).set({ stage, updatedByUserId: recruiterId, updatedAt: new Date() })
      .where(and(eq(pipelineEntries.candidateId, candidateId), eq(pipelineEntries.requisitionId, IDS.reqA)))

  for (const [i, r] of ranked.entries()) {
    if (i < 4 && !r.isBelowFit) {
      // The recruiter must open a CV before submitting: seed records that view.
      await db.insert(submissions).values({
        id: createId(), candidateId: r.candidateId, requisitionId: IDS.reqA,
        submittedByUserId: recruiterId, viewedByRecruiterAt: new Date(),
        recruiterNote: 'Strong match on core stack.',
      }).onConflictDoNothing()
      await setStage(r.candidateId, i === 3 ? 'shortlisted' : 'submitted')
    } else {
      await setStage(r.candidateId, 'screened')
    }
  }

  console.log(`Seeded ${cvs.length} CVs:`, tally, `| ranked: ${ranked.length}`)
  console.log('Demo logins: recruiter@shortlist.test, client.meridian@shortlist.test, head@shortlist.test (password: SEED_PASSWORD or the default in scripts/seed/seed.ts)')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
