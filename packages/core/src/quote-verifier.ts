/**
 * packages/core/src/quote-verifier.ts
 *
 * AI Rule #2: Every quote returned by the LLM must be verified as a substring
 * of the original CV text (whitespace/case-normalised) before it is shown as
 * evidence to any user.
 *
 * Unverified quote → dropped, criterion marked with verified=false.
 */

// ─── Normalisation ────────────────────────────────────────────────────────────

/**
 * Normalise text for comparison:
 *   1. Lowercase
 *   2. Collapse all whitespace sequences (including newlines) to a single space
 *   3. Trim leading/trailing whitespace
 */
export function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

// ─── Verification ─────────────────────────────────────────────────────────────

export interface VerifyQuoteResult {
  verified: boolean
  /** Reason for failure, if not verified. */
  reason?: string
}

/**
 * Verify that `quote` appears as a substring of `sourceText` after normalisation.
 *
 * @param quote      - The quote returned by the LLM.
 * @param sourceText - The original CV raw text (pre-redaction).
 * @returns VerifyQuoteResult
 *
 * @example
 * verifyQuote("5 years experience in React", "... 5 years experience in React ...")
 * // → { verified: true }
 *
 * verifyQuote("10 years experience", "5 years experience in React")
 * // → { verified: false, reason: "quote not found in source text" }
 */
export function verifyQuote(
  quote: string | null | undefined,
  sourceText: string,
): VerifyQuoteResult {
  if (!quote || quote.trim().length === 0) {
    return { verified: false, reason: 'quote is empty or null' }
  }

  const normQuote = normalise(quote)
  const normSource = normalise(sourceText)

  if (normSource.includes(normQuote)) {
    return { verified: true }
  }

  return {
    verified: false,
    reason: 'quote not found in source text after normalisation',
  }
}

/**
 * Batch-verify an array of quotes against the same source text.
 * Returns a parallel array of VerifyQuoteResult.
 */
export function verifyQuotes(
  quotes: Array<string | null | undefined>,
  sourceText: string,
): VerifyQuoteResult[] {
  const normSource = normalise(sourceText)
  return quotes.map((quote) => {
    if (!quote || quote.trim().length === 0) {
      return { verified: false, reason: 'quote is empty or null' }
    }
    const normQuote = normalise(quote)
    if (normSource.includes(normQuote)) {
      return { verified: true }
    }
    return {
      verified: false,
      reason: 'quote not found in source text after normalisation',
    }
  })
}

// ─── Salvaging a quote that crossed a redaction ───────────────────────────────

const REDACTION_MARKER = /\[REDACTED:[A-Z_]+\]/g

/**
 * The scorer reads REDACTED text, so a quote may run across a "[REDACTED:EMAIL]"
 * style marker. Those words are not in the CV, so the whole quote fails
 * verification even though most of it is genuine. This keeps the longest piece
 * of the quote that has no marker in it AND is found verbatim in the original
 * CV (at least `minLength` characters). It never rewrites or adds text: what
 * comes back is either the original quote, a verbatim part of it, or null.
 */
export function salvageQuote(
  quote: string | null | undefined,
  sourceText: string,
  minLength = 8,
): string | null {
  if (!quote || !quote.trim()) return null
  if (verifyQuote(quote, sourceText).verified) return quote
  const pieces = quote
    .split(REDACTION_MARKER)
    .map((p) => p.trim())
    .filter((p) => p.length >= minLength)
    .sort((a, b) => b.length - a.length)
  return pieces.find((p) => verifyQuote(p, sourceText).verified) ?? null
}

// ─── Locating a verified quote ────────────────────────────────────────────────

export interface QuoteSpan {
  start: number
  end: number
}

/**
 * Find where a quote sits in the ORIGINAL text, for highlighting. Uses the same
 * rules as verifyQuote (case-insensitive, any whitespace run is equal), so a
 * quote that verified is always locatable. Returns null if it does not occur.
 */
export function locateQuote(quote: string | null | undefined, sourceText: string): QuoteSpan | null {
  const words = (quote ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return null
  const pattern = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')
  const m = new RegExp(pattern, 'i').exec(sourceText)
  return m ? { start: m.index, end: m.index + m[0].length } : null
}
