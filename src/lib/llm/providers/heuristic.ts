/**
 * src/lib/llm/providers/heuristic.ts
 *
 * Keyword/regex-based scorer — the "heuristic" provider.
 * Makes the app fully functional with zero API keys.
 * Used as the default when LLM_PROVIDER=heuristic (or unset).
 *
 * Scoring strategy:
 *   For each criterion, search the CV text for keywords extracted from the
 *   criterion label + description. If keywords found → met='yes'. If partial
 *   overlap → met='partial'. If none → met='no'.
 *
 * Scorecard extraction:
 *   Regex-based extraction of common JD patterns (years experience, required
 *   skills, responsibilities). Returns a plausible scorecard as a starting point.
 */
import type {
  LLMProvider,
  LLMScoringRequest,
  LLMScoringResponse,
  LLMCriterionResponse,
} from '../types'
import { extractJdCriteria } from '@shortlist/core'
import type { ScorecardCriterion } from '@/db/types'

// ─── Heuristic scoring ────────────────────────────────────────────────────────

function extractKeywords(text: string): string[] {
  // Strip common stop words and split into meaningful tokens
  const stopWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be',
    'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can',
    'experience', 'years', 'strong', 'good', 'excellent', 'ability', 'skills',
    'knowledge', 'understanding', 'proficiency', 'proficient', 'working',
  ])
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w))
}

/** Whole-word match: "java" must not match inside "javascript", nor "rest" inside "interest". */
function hasWord(lowerText: string, keyword: string): boolean {
  return wordIndex(lowerText, keyword) !== -1
}

function wordIndex(lowerText: string, keyword: string): number {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|[^a-z0-9])(${escaped})(?![a-z0-9])`).exec(lowerText)
  return m ? m.index + m[0].length - keyword.length : -1
}

const REDACTION_MARKER = /\[REDACTED:[A-Z_]+\]/g
const MAX_QUOTE_CHARS = 160

/**
 * A quote must be an exact piece of the ORIGINAL CV (AI rule 2), but the scorer
 * reads the REDACTED text. So quote one line, never across a [REDACTED:...]
 * marker (those words do not exist in the CV), and keep it short.
 */
function findBestQuote(text: string, keyword: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const idx = wordIndex(line.toLowerCase(), keyword)
    if (idx === -1) continue

    let start = 0
    let end = line.length
    for (const m of line.matchAll(REDACTION_MARKER)) {
      const mEnd = m.index + m[0].length
      if (mEnd <= idx) start = Math.max(start, mEnd)
      else if (m.index >= idx + keyword.length) end = Math.min(end, m.index)
    }
    let from = start
    let to = end
    if (to - from > MAX_QUOTE_CHARS) {
      from = Math.max(start, idx - 60)
      to = Math.min(end, idx + keyword.length + 90)
    }
    const quote = line.slice(from, to).replace(/^[\s|,;:–-]+|[\s|,;:–-]+$/g, '')
    if (quote.length >= keyword.length) return quote
  }
  return null
}

function scoreCriterion(
  criterion: ScorecardCriterion,
  cvText: string,
): LLMCriterionResponse {
  // The description is what to look for in a CV; the label is only a title ("Seniority" is a word no CV contains).
  const criterionText = criterion.description.trim() ? criterion.description : criterion.label
  const keywords = extractKeywords(criterionText)
  const lowerCv = cvText.toLowerCase()

  if (keywords.length === 0) {
    return {
      criterionId: criterion.id,
      met: 'unknown',
      quote: null,
      confidence: 0.3,
    }
  }

  const matched = keywords.filter((kw) => hasWord(lowerCv, kw))
  const ratio = matched.length / keywords.length

  let met: LLMCriterionResponse['met']
  let confidence: number

  if (ratio >= 0.6) {
    met = 'yes'
    confidence = 0.55 + ratio * 0.2 // 0.67–0.75 for heuristic
  } else if (ratio >= 0.25) {
    met = 'partial'
    confidence = 0.4 + ratio * 0.3
  } else {
    met = 'no'
    confidence = 0.5
  }

  // Try to find a supporting quote for the first matched keyword
  const firstMatch = matched[0]
  const quote = firstMatch ? findBestQuote(cvText, firstMatch) : null

  return { criterionId: criterion.id, met, quote, confidence }
}

// ─── HeuristicProvider class ──────────────────────────────────────────────────

export class HeuristicProvider implements LLMProvider {
  readonly name = 'heuristic' as const

  async score(request: LLMScoringRequest): Promise<LLMScoringResponse> {
    const results = request.criteria.map((c) =>
      scoreCriterion(c, request.redactedText),
    )
    return {
      criteria: results,
      provider: 'heuristic',
      fromCache: false,
    }
  }

  /** Reads the JD with the shared, tested extractor (packages/core/src/jd-criteria.ts). */
  async extractScorecard(jdText: string): Promise<Omit<ScorecardCriterion, 'id'>[]> {
    return extractJdCriteria(jdText)
  }
}
