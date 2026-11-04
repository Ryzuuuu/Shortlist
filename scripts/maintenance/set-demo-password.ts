/**
 * scripts/maintenance/set-demo-password.ts   —   npm run db:demo-password
 *
 * Sets the password of the four seeded demo accounts to $SEED_PASSWORD (12+ characters),
 * using Better Auth's own hasher. Use it to hand reviewers a known password without
 * re-seeding. It touches only the credential rows of the demo accounts listed below.
 */
import { and, eq, inArray } from 'drizzle-orm'
import { hashPassword } from 'better-auth/crypto'
import { db } from '@/db'
import { accounts, users } from '@/db/schema'

const DEMO_EMAILS = [
  'recruiter@shortlist.test',
  'client.meridian@shortlist.test',
  'client.kestrel@shortlist.test',
  'head@shortlist.test',
]

async function main() {
  const password = process.env.SEED_PASSWORD ?? ''
  if (password.length < 12) {
    console.error('SEED_PASSWORD must be set to a strong value (12+ characters).')
    process.exit(1)
  }
  const rows = await db.select({ id: users.id, email: users.email }).from(users).where(inArray(users.email, DEMO_EMAILS))
  const hash = await hashPassword(password)
  for (const u of rows) {
    await db.update(accounts).set({ password: hash, updatedAt: new Date() }).where(and(eq(accounts.userId, u.id), eq(accounts.providerId, 'credential')))
  }
  console.log(`Updated the password for ${rows.length} of ${DEMO_EMAILS.length} demo accounts.`)
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1) })
