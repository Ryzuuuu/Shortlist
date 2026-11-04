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
  const criterionText = `${criterion.label} ${criterion.description}`
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

// ─── JD scorecard extraction ──────────────────────────────────────────────────

const JD_PATTERNS: Array<{ regex: RegExp; label: string; weight: number; mustHave: boolean }> = [
  {
    regex: /(\d+)\+?\s*years?\s+(?:of\s+)?(?:experience|exp)/gi,
    label: 'Years of experience',
    weight: 0.25,
    mustHave: true,
  },
  {
    regex: /(?:required|must\s+have|essential)[:\s]+([^.\n]{10,80})/gi,
    label: 'Required qualification',
    weight: 0.3,
    mustHave: true,
  },
  {
    regex: /(?:bachelor'?s?|master'?s?|b\.?tech|m\.?tech|degree)\s+(?:in\s+)?([^,.\n]{5,50})/gi,
    label: 'Education requirement',
    weight: 0.15,
    mustHave: false,
  },
  {
    regex: /(?:proficient|experience|strong)\s+(?:in|with)\s+([^,.\n]{5,60})/gi,
    label: 'Technical skill',
    weight: 0.2,
    mustHave: false,
  },
  {
    regex: /(?:responsibilities|you\s+will|role\s+involves)[:\s]+([^.\n]{10,100})/gi,
    label: 'Key responsibility',
    weight: 0.1,
    mustHave: false,
  },
]

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

  async extractScorecard(
    jdText: string,
  ): Promise<Omit<ScorecardCriterion, 'id'>[]> {
    const criteria: Omit<ScorecardCriterion, 'id'>[] = []
    const seen = new Set<string>()

    for (const pattern of JD_PATTERNS) {
      // Reset lastIndex for global regexes
      pattern.regex.lastIndex = 0
      let match: RegExpExecArray | null
      let count = 0

      while ((match = pattern.regex.exec(jdText)) !== null && count < 3) {
        const extracted = (match[1] ?? match[0]).trim().slice(0, 120)
        const key = extracted.toLowerCase()
        if (!seen.has(key) && extracted.length > 5) {
          seen.add(key)
          criteria.push({
            label: pattern.label,
            description: extracted,
            weight: pattern.weight,
            mustHave: pattern.mustHave,
          })
          count++
        }
      }
    }

    // Normalise weights so they sum to 1
    const totalWeight = criteria.reduce((s, c) => s + c.weight, 0)
    if (totalWeight > 0) {
      for (const c of criteria) {
        c.weight = Math.round((c.weight / totalWeight) * 100) / 100
      }
    }

    // Fallback: if nothing extracted, return a generic scorecard
    if (criteria.length === 0) {
      return [
        { label: 'Relevant experience', description: 'Experience relevant to the role', weight: 0.4, mustHave: true },
        { label: 'Technical skills', description: 'Technical skills mentioned in JD', weight: 0.35, mustHave: false },
        { label: 'Education', description: 'Required educational background', weight: 0.25, mustHave: false },
      ]
    }

    return criteria
  }
}
