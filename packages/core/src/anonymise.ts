/**
 * packages/core/src/anonymise.ts
 *
 * One-way identifier for the anonymised audit stub kept after a DPDP deletion
 * (ASSUMPTION A9). A keyed hash, not a plain one: record IDs are short random
 * strings, so an unkeyed hash could be brute-forced back to the ID by anyone
 * holding an old export. With the server-side key it cannot.
 */
import { createHmac } from 'crypto'

export const ANONYMISED_PREFIX = 'anon:'

export function anonymiseId(id: string, key: string): string {
  if (!key) throw new Error('anonymiseId requires a non-empty key')
  return ANONYMISED_PREFIX + createHmac('sha256', key).update(id).digest('hex').slice(0, 32)
}

export function isAnonymisedId(id: string | null | undefined): boolean {
  return !!id && id.startsWith(ANONYMISED_PREFIX)
}
