/**
 * scripts/maintenance/reextract.ts   —   npm run db:reextract
 *
 * Re-derives every candidate's profile and normalised e-mail/phone from the CV
 * text already stored, using the current extractor and normalisers. Safe to run
 * repeatedly (idempotent); run it after changing either so duplicate checks and
 * filters see consistent data. Reads and writes only the candidates table.
 */
import { eq } from 'drizzle-orm'
import { extractProfile, normaliseEmail, normalisePhone } from '@shortlist/core'
import { db } from '@/db'
import { candidates } from '@/db/schema'
import type { CandidateProfile } from '@/db/types'

async function main() {
  const rows = await db
    .select({ id: candidates.id, rawText: candidates.rawText, profile: candidates.profile, email: candidates.normalisedEmail, phone: candidates.normalisedPhone })
    .from(candidates)

  let changed = 0
  for (const row of rows) {
    const e = extractProfile(row.rawText)
    const old = row.profile as CandidateProfile
    // Keep what was already there where the new pass finds nothing, so nothing is lost.
    const profile: CandidateProfile = {
      ...old,
      firstName: e.firstName || old.firstName,
      lastName: e.lastName || old.lastName,
      email: e.email ?? old.email,
      phone: e.phone ?? old.phone,
      headline: e.headline || old.headline,
      currentCompany: e.currentCompany ?? old.currentCompany,
      currentRole: e.currentRole ?? old.currentRole,
      location: e.location ?? old.location,
      skills: e.skills.length ? e.skills : old.skills,
      workHistory: e.workHistory.length ? e.workHistory.map((w) => ({ ...w, description: '' })) : old.workHistory,
      education: e.education.length ? e.education.map((d) => ({ institution: d.institution, degree: d.degree, field: '', graduationYear: d.graduationYear })) : old.education,
      experienceYears: e.experienceYears,
      noticeDays: e.statedNoticeDays,
      ctcLpa: e.ctcLpa,
    }
    const normalisedEmail = normaliseEmail(profile.email)
    const normalisedPhone = normalisePhone(profile.phone)
    if (JSON.stringify(profile) === JSON.stringify(old) && normalisedEmail === row.email && normalisedPhone === row.phone) continue
    await db.update(candidates).set({ profile, normalisedEmail, normalisedPhone, updatedAt: new Date() }).where(eq(candidates.id, row.id))
    changed++
  }
  console.log(`Checked ${rows.length} candidates, updated ${changed}.`)
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1) })
