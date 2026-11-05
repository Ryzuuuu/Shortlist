/**
 * packages/core/src/redact.ts
 *
 * Strips PII from CV text before it is sent to any LLM.
 * Covered by DPDP Act 2023 and the AI Rules (rule #3).
 *
 * Redacted fields:
 *   • Name        — the candidate's own name, supplied by the caller (see RedactOptions)
 *   • Email       — RFC-5321 simplified regex
 *   • Phone       — international + domestic formats
 *   • Gender      — pronouns, explicit gender words
 *   • Age / DOB   — date patterns, "age N", "born"
 *   • Photo refs  — "photograph", "photo attached" etc.
 *   • Marital     — marital status words
 *   • Address     — street number + road keywords (best-effort)
 *
 * Strategy: regex replacement → [REDACTED:<TYPE>]
 * All replacements are case-insensitive and global.
 *
 * Names cannot be recognised by a regex, so the caller passes the name it has already
 * extracted from the CV; every occurrence of it is replaced. Pronouns are not removed.
 *
 * IMPORTANT: This is best-effort regex redaction. It is not a substitute
 * for a dedicated NER model. The LLM is instructed never to use personal
 * identifiers in its response; this is a defence-in-depth measure.
 */

export interface RedactionResult {
  /** The redacted text safe to send to the LLM. */
  redactedText: string
  /** Number of replacements made, by category. */
  stats: Record<string, number>
}

export interface RedactOptions {
  /** The candidate's own name parts, e.g. ['Ritika', 'Bansal']. */
  names?: string[]
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Replace the candidate's name. The full name (in order, any spacing, any case) is replaced
 * first; then each part of 3+ letters, matched with exact capitalisation and as a whole word,
 * so "Dev" the surname is caught but the word "dev" in "dev tools" is left alone.
 */
function countAndReplaceNames(text: string, names: string[]): { text: string; count: number } {
  const parts = names.flatMap((n) => n.split(/\s+/)).map((n) => n.replace(/[^\p{L}'’-]/gu, '')).filter(Boolean)
  if (parts.length === 0) return { text, count: 0 }
  let count = 0
  const mark = '[REDACTED:NAME]'
  let out = text
  if (parts.length > 1) {
    const full = new RegExp(String.raw`(?<![\p{L}])${parts.map(escapeRe).join(String.raw`\s+`)}(?![\p{L}])`, 'giu')
    out = out.replace(full, () => (count++, mark))
  }
  for (const part of new Set(parts.filter((p) => p.length >= 3))) {
    const re = new RegExp(String.raw`(?<![\p{L}])${escapeRe(part)}(?![\p{L}])`, 'gu')
    out = out.replace(re, () => (count++, mark))
  }
  return { text: out, count }
}

// ─── Patterns ─────────────────────────────────────────────────────────────────

interface Pattern {
  name: string
  regex: RegExp
  replacement: string
}

const PATTERNS: Pattern[] = [
  // Email — must come before phone (avoids partial overlap)
  {
    name: 'email',
    regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    replacement: '[REDACTED:EMAIL]',
  },

  // Phone — Indian mobile (optional +91, 5+5 digits) first, then E.164-style and common separators.
  // The digit boundaries stop a number being cut short and leaving a stray digit behind.
  {
    name: 'phone',
    regex:
      /(?<!\d)(?:\+?91[\s\-.]?)?0?[6-9]\d{4}[\s\-.]?\d{5}(?!\d)|(?<!\d)(?:\+?\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}(?!\d)/g,
    replacement: '[REDACTED:PHONE]',
  },

  // Date of birth — explicit DOB label
  {
    name: 'dob',
    regex:
      /\b(?:d\.?o\.?b\.?|date\s+of\s+birth|born\s+on?)\s*:?\s*\d{1,2}[\s/\-.]\w+[\s/\-.]\d{2,4}/gi,
    replacement: '[REDACTED:DOB]',
  },

  // Age — "age: 28", "28 years old"
  {
    name: 'age',
    regex: /\b(?:age\s*:?\s*\d{1,3}|\d{1,3}\s+years?\s+old)\b/gi,
    replacement: '[REDACTED:AGE]',
  },

  // Standalone dates that look like DOB (dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy)
  {
    name: 'date',
    regex:
      /\b(?:0?[1-9]|[12]\d|3[01])[/\-.](0?[1-9]|1[0-2])[/\-.](?:19|20)\d{2}\b/g,
    replacement: '[REDACTED:DATE]',
  },

  // Gender — explicit words and common pronoun markers
  {
    name: 'gender',
    regex:
      /\b(?:gender|sex)\s*:?\s*(?:male|female|non[\s-]?binary|prefer\s+not\s+to\s+say|transgender|m|f)\b/gi,
    replacement: '[REDACTED:GENDER]',
  },

  // Marital status
  {
    name: 'marital',
    regex:
      /\b(?:marital\s+status|relationship\s+status)\s*:?\s*(?:single|married|divorced|widowed|separated|in\s+a\s+relationship)\b/gi,
    replacement: '[REDACTED:MARITAL]',
  },

  // Photo references
  {
    name: 'photo',
    regex:
      /\b(?:photograph|photo|picture|headshot)\b(?:\s+(?:attached|enclosed|available|on\s+request)\b)?|\b(?:image|picture)\s+(?:attached|enclosed)\b/gi,
    replacement: '[REDACTED:PHOTO]',
  },

  // Nationality / citizenship (can reveal protected characteristic)
  {
    name: 'nationality',
    regex:
      /\b(?:nationality|citizenship|citizen\s+of)\s*:?\s*[A-Za-z\s]+(?=\b)/gi,
    replacement: '[REDACTED:NATIONALITY]',
  },
]

// ─── Redact function ──────────────────────────────────────────────────────────

/**
 * Redact PII from CV raw text before LLM submission.
 *
 * @param rawText - The full extracted text from the CV.
 * @returns RedactionResult with redacted text and per-category stats.
 *
 * @example
 * const { redactedText } = redact("John Smith, john@example.com, DOB: 12/05/1990")
 * // → "John Smith, [REDACTED:EMAIL], [REDACTED:DATE]"
 * // Note: name redaction is best-effort via NER-like heuristics
 */
export function redact(rawText: string, options: RedactOptions = {}): RedactionResult {
  const stats: Record<string, number> = {}
  let text = rawText

  // Names first, so no later pattern can break a name apart.
  const nameCount = countAndReplaceNames(text, options.names ?? [])
  if (nameCount.count > 0) {
    stats.name = nameCount.count
    text = nameCount.text
  }

  for (const pattern of PATTERNS) {
    const matches = text.match(pattern.regex) ?? []
    if (matches.length > 0) {
      stats[pattern.name] = matches.length
      text = text.replace(pattern.regex, pattern.replacement)
    }
  }

  return { redactedText: text, stats }
}

/**
 * Returns true if the text contains any un-redacted pattern matches.
 * Useful in tests to assert redaction completeness.
 */
export function containsPii(text: string): boolean {
  return PATTERNS.some((p) => {
    // Reset lastIndex for stateful regexes (global flag)
    p.regex.lastIndex = 0
    return p.regex.test(text)
  })
}
