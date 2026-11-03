/**
 * packages/core/src/profile-extract.ts
 *
 * Deterministic CV text -> profile extraction. No LLM: it must work for the
 * `heuristic` provider and never invent facts, so every field is either read
 * from the text or left null/empty.
 */

export interface ExtractedProfile {
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  headline: string
  currentCompany: string | null
  currentRole: string | null
  location: string | null
  skills: string[]
  /** Years of experience if the CV states it explicitly */
  statedExperienceYears: number | null
  /** Notice period in days if the CV states it explicitly */
  statedNoticeDays: number | null
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const PHONE_RE = /(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{3,5}\)?[\s-]?)?\d{3,5}[\s-]?\d{4,5}/
const YEARS_RE = /(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years?|yrs?)\b/i
const NOTICE_RE = /notice(?:\s+period)?\s*[:\-]?\s*(\d{1,3})\s*(days?|months?)/i

const SECTION_HEADINGS =
  /^(summary|profile|objective|experience|work experience|employment|education|skills|key skills|technical skills|projects|certifications|contact)\s*:?$/i

const ROLE_WORDS =
  /\b(developer|engineer|analyst|manager|consultant|architect|lead|specialist|executive|administrator|tester|designer|officer)\b/i

const KNOWN_SKILLS = [
  'java', 'spring boot', 'spring', 'hibernate', 'microservices', 'rest apis', 'rest',
  'sql', 'postgresql', 'mysql', 'oracle', 'mongodb', 'redis', 'kafka', 'docker',
  'kubernetes', 'aws', 'azure', 'gcp', 'javascript', 'typescript', 'react', 'node.js',
  'python', 'django', 'c#', '.net', 'angular', 'git', 'jenkins', 'maven', 'junit',
  'kyc', 'aml', 'excel', 'sap', 'tally', 'power bi',
]

function nonEmptyLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

function extractPhone(text: string): string | null {
  for (const m of text.matchAll(new RegExp(PHONE_RE.source, 'g'))) {
    const digits = m[0].replace(/\D/g, '')
    if (digits.length >= 10 && digits.length <= 13) return m[0].trim()
  }
  return null
}

function extractName(lines: string[]): { firstName: string; lastName: string } {
  for (const line of lines.slice(0, 6)) {
    if (EMAIL_RE.test(line) || /\d/.test(line) || SECTION_HEADINGS.test(line)) continue
    if (ROLE_WORDS.test(line)) continue
    const words = line.split(/\s+/)
    if (words.length >= 2 && words.length <= 4 && words.every((w) => /^[A-Za-z.'-]+$/.test(w))) {
      const [first, ...rest] = words
      return { firstName: first ?? '', lastName: rest.join(' ') }
    }
  }
  return { firstName: '', lastName: '' }
}

function extractSkills(text: string): string[] {
  const lower = text.toLowerCase()
  const found = new Set<string>()
  for (const skill of KNOWN_SKILLS) {
    const escaped = skill.replace(/[.+#]/g, '\\$&')
    if (new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`).test(lower)) found.add(skill)
  }
  // Drop a generic term when a more specific one is present ("spring" vs "spring boot").
  if (found.has('spring boot')) found.delete('spring')
  if (found.has('rest apis')) found.delete('rest')
  return [...found]
}

/**
 * Pull "Role at Company" / "Role, Company" from the first experience-like line.
 */
function extractCurrent(lines: string[]): { role: string | null; company: string | null } {
  for (const line of lines) {
    if (line.length > 100 || !ROLE_WORDS.test(line)) continue
    const m = line.match(/^(.+?)\s+(?:at|@|,|-|–|\|)\s+(.+)$/i)
    if (m && m[1] && m[2] && ROLE_WORDS.test(m[1])) {
      return { role: m[1].trim(), company: m[2].trim() }
    }
  }
  return { role: null, company: null }
}

function extractHeadline(lines: string[]): string {
  for (const line of lines.slice(0, 8)) {
    if (line.length <= 80 && ROLE_WORDS.test(line) && !EMAIL_RE.test(line)) return line
  }
  return ''
}

function extractLocation(text: string): string | null {
  const m = text.match(/(?:location|address|city)\s*[:\-]\s*([A-Za-z ,]{3,40})/i)
  return m?.[1]?.trim() ?? null
}

export function extractProfile(rawText: string): ExtractedProfile {
  const lines = nonEmptyLines(rawText)
  const { firstName, lastName } = extractName(lines)
  const cur = extractCurrent(lines)
  const years = rawText.match(YEARS_RE)
  const notice = rawText.match(NOTICE_RE)

  let noticeDays: number | null = null
  if (notice?.[1] && notice[2]) {
    const n = Number(notice[1])
    noticeDays = /month/i.test(notice[2]) ? n * 30 : n
  }

  return {
    firstName,
    lastName,
    email: rawText.match(EMAIL_RE)?.[0] ?? null,
    phone: extractPhone(rawText),
    headline: extractHeadline(lines) || cur.role || '',
    currentCompany: cur.company,
    currentRole: cur.role,
    location: extractLocation(rawText),
    skills: extractSkills(rawText),
    statedExperienceYears: years?.[1] ? Number(years[1]) : null,
    statedNoticeDays: noticeDays,
  }
}
