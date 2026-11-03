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
