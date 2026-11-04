/**
 * packages/core/src/dedup.ts
 *
 * Global candidate deduplication — pure logic, no DB calls.
 * Match order (ASSUMPTION A2):
 *   1. Normalised email (exact match after lowercase + trim)
 *   2. Normalised phone (E.164-normalised, exact)
 *   3. Fuzzy: Jaro-Winkler similarity on (fullName + company + role) ≥ 0.92
 *
 * This module only provides the matching functions; the DB lookup is done in
 * the ingestion service which calls these helpers.
 */

// ─── Normalisation helpers ────────────────────────────────────────────────────

/** Domains where dots in the local part are not significant (Gmail ignores them). */
const DOT_INSENSITIVE_DOMAINS = new Set(['gmail.com', 'googlemail.com'])

/**
 * Normalise an email address for dedup comparison.
 * Lowercase, trim, drop a "+tag" alias, and drop dots from the local part ONLY
 * for providers that ignore them (Gmail). On other domains dots are significant:
 * john.smith@corp.com and johnsmith@corp.com are usually different people, and
 * merging them would join two candidates' records.
 */
export function normaliseEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const trimmed = email.toLowerCase().trim()
  const at = trimmed.lastIndexOf('@')
  if (at <= 0 || at === trimmed.length - 1) return trimmed || null
  const domain = trimmed.slice(at + 1)
  let local = trimmed.slice(0, at).replace(/\+.*$/, '')
  if (DOT_INSENSITIVE_DOMAINS.has(domain)) local = local.replace(/\./g, '')
  return local ? `${local}@${domain}` : trimmed
}

/**
 * Normalise a phone number for comparison: digits only, leading zeros dropped,
 * and anything beyond the last 10 digits (country code such as 91) ignored, so
 * "+91 98765 43210", "098765 43210" and "98765-43210" are the same number.
 * Returns null if fewer than 7 digits remain.
 */
export function normalisePhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const stripped = phone.replace(/\D/g, '').replace(/^0+/, '')
  if (stripped.length < 7) return null
  return stripped.length > 10 ? stripped.slice(-10) : stripped
}

// ─── Jaro-Winkler similarity ──────────────────────────────────────────────────

/**
 * Compute Jaro similarity between two strings.
 * Returns 0–1 (1 = identical).
 */
function jaro(s1: string, s2: string): number {
  if (s1 === s2) return 1

  const len1 = s1.length
  const len2 = s2.length

  const matchDist = Math.floor(Math.max(len1, len2) / 2) - 1
  if (matchDist < 0) return 0

  const s1Matches = new Array<boolean>(len1).fill(false)
  const s2Matches = new Array<boolean>(len2).fill(false)

  let matches = 0
  let transpositions = 0

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDist)
    const end = Math.min(i + matchDist + 1, len2)

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue
      s1Matches[i] = true
      s2Matches[j] = true
      matches++
      break
    }
  }

  if (matches === 0) return 0

  let k = 0
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue
    while (!s2Matches[k]) k++
    if (s1[i] !== s2[k]) transpositions++
    k++
  }

  return (
    (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3
  )
}

/**
 * Compute Jaro-Winkler similarity.
 * Boosts score for strings that share a common prefix (up to 4 chars).
 */
export function jaroWinkler(s1: string, s2: string): number {
  const jaroScore = jaro(s1, s2)

  // Prefix length (max 4)
  let prefix = 0
  for (let i = 0; i < Math.min(4, Math.min(s1.length, s2.length)); i++) {
    if (s1[i] === s2[i]) prefix++
    else break
  }

  return jaroScore + prefix * 0.1 * (1 - jaroScore)
}

// ─── Fuzzy match on identity tuple ───────────────────────────────────────────

export interface CandidateIdentity {
  fullName: string
  currentCompany: string | null
  currentRole: string | null
}

/**
 * Build a normalised "identity string" for fuzzy comparison:
 * "<fullName>|<company>|<role>" — all lowercase, trimmed.
 */
function identityString(identity: CandidateIdentity): string {
  return [
    identity.fullName,
    identity.currentCompany ?? '',
    identity.currentRole ?? '',
  ]
    .map((s) => s.toLowerCase().trim())
    .join('|')
}

/**
 * Returns true if two candidate identities are likely the same person,
 * using Jaro-Winkler similarity ≥ 0.92 on the identity string.
 */
export function isFuzzyMatch(
  a: CandidateIdentity,
  b: CandidateIdentity,
  threshold = 0.92,
): boolean {
  const strA = identityString(a)
  const strB = identityString(b)
  return jaroWinkler(strA, strB) >= threshold
}

// ─── Unified dedup check ──────────────────────────────────────────────────────

export interface DedupCandidate {
  id: string
  normalisedEmail: string | null
  normalisedPhone: string | null
  identity: CandidateIdentity
}

export type DedupMatchReason = 'email' | 'phone' | 'fuzzy'

export interface DedupMatch {
  candidateId: string
  reason: DedupMatchReason
  /** Jaro-Winkler score for fuzzy matches; 1.0 for email/phone exact matches */
  similarity: number
}

/**
 * Find the best matching existing candidate for an incoming candidate.
 * Match priority: email → phone → fuzzy.
 * Returns null if no match found.
 *
 * @param incoming      - The newly parsed candidate to check.
 * @param existingPool  - The existing global candidate pool (fetched from DB by caller).
 */
export function findDuplicate(
  incoming: DedupCandidate,
  existingPool: DedupCandidate[],
): DedupMatch | null {
  const inEmail = incoming.normalisedEmail
  const inPhone = incoming.normalisedPhone

  for (const existing of existingPool) {
    // 1. Email match (highest priority)
    if (inEmail && existing.normalisedEmail && inEmail === existing.normalisedEmail) {
      return { candidateId: existing.id, reason: 'email', similarity: 1.0 }
    }

    // 2. Phone match
    if (inPhone && existing.normalisedPhone && inPhone === existing.normalisedPhone) {
      return { candidateId: existing.id, reason: 'phone', similarity: 1.0 }
    }
  }

  // 3. Fuzzy match (only if no email/phone match found)
  let bestMatch: DedupMatch | null = null
  let bestScore = 0

  for (const existing of existingPool) {
    const score = jaroWinkler(
      identityString(incoming.identity),
      identityString(existing.identity),
    )
    if (score >= 0.92 && score > bestScore) {
      bestScore = score
      bestMatch = { candidateId: existing.id, reason: 'fuzzy', similarity: score }
    }
  }

  return bestMatch
}
