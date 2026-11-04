/**
 * packages/core/src/profile-extract.ts
 *
 * Deterministic CV text -> profile extraction. No LLM: it must work for the
 * `heuristic` provider and for scanned CVs after transcription, and it must never
 * invent facts. Every field is read from the text or left null / empty.
 *
 * CVs vary wildly, so the extractor works from several signals: labelled fields
 * ("Name:", "Notice Period:"), section headings, date ranges, and plain layout.
 */

export interface WorkEntry {
  company: string
  role: string
  /** ISO year-month, e.g. "2019-01" */
  startDate: string | null
  /** null = current */
  endDate: string | null
}

export interface EducationItem {
  degree: string
  institution: string
  graduationYear: number | null
}

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
  workHistory: WorkEntry[]
  education: EducationItem[]
  /** Years of experience if the CV states it outright */
  statedExperienceYears: number | null
  /** Stated, otherwise computed from the work-history dates; null when neither is possible */
  experienceYears: number | null
  experienceSource: 'stated' | 'computed' | null
  /** Notice period in days. 0 = immediate. */
  statedNoticeDays: number | null
  /** Expected CTC if given, otherwise current CTC, in lakhs per annum */
  ctcLpa: number | null
}

// ─── Small helpers ───────────────────────────────────────────────────────────

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

const ROLE_WORDS =
  /\b(developer|engineer|analyst|manager|consultant|architect|lead|specialist|executive|administrator|tester|designer|officer|scientist|associate|intern|director|head|programmer|accountant|coordinator)\b/i

const SECTION_NAMES =
  'experience|work experience|professional experience|employment|employment history|work history|career history|education|academic|academics|qualifications|skills|key skills|technical skills|core competencies|projects|certifications|summary|profile|objective|achievements|personal details|personal information|declaration|languages|interests|references|contact'
const HEADING_RE = new RegExp(`^(?:${SECTION_NAMES})\\s*:?$`, 'i')
const EXPERIENCE_HEADING_RE = /^(?:work |professional |relevant )?(?:experience|employment(?: history)?|work history|career history)\s*:?$/i
const EDUCATION_HEADING_RE = /^(?:education|academics?|qualifications|academic (?:details|background))\s*:?$/i
const SKILLS_HEADING_RE = /^(?:key |technical |core |it )?(?:skills|competencies)(?: (?:&|and) tools)?\s*:?$/i

const DEGREE_RE =
  /\b(b\.?\s?tech|m\.?\s?tech|b\.?\s?e\.?|m\.?\s?e\.?|b\.?\s?sc|m\.?\s?sc|b\.?\s?com|m\.?\s?com|b\.?\s?ca|m\.?\s?ca|b\.?\s?a\.?|m\.?\s?a\.?|mba|pgdm|ph\.?\s?d|bachelor|master|diploma|b\.?\s?b\.?\s?a)\b/i
const INSTITUTION_RE = /\b(university|institute|college|school|iit|nit|iiit|academy)\b/i

const KNOWN_SKILLS = [
  'java', 'spring boot', 'spring', 'hibernate', 'microservices', 'rest apis', 'rest', 'sql', 'postgresql', 'mysql', 'oracle',
  'mongodb', 'redis', 'kafka', 'rabbitmq', 'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'javascript', 'typescript', 'react',
  'node.js', 'python', 'django', 'flask', 'c#', '.net', 'angular', 'vue', 'git', 'jenkins', 'maven', 'gradle', 'junit',
  'selenium', 'kyc', 'aml', 'excel', 'sap', 'tally', 'power bi', 'tableau', 'jira', 'agile', 'scrum', 'ci/cd', 'linux',
]

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()
const lines = (text: string) => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
const round1 = (n: number) => Math.round(n * 10) / 10

function toTitleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase())
}

// ─── Name ────────────────────────────────────────────────────────────────────

const NON_NAME_LINE = /^(?:curriculum vitae|resume|r[eé]sum[eé]|cv|bio-?data|profile|contact|summary)$/i

function extractName(all: string[]): { firstName: string; lastName: string } {
  const candidates: string[] = []
  for (const line of all.slice(0, 10)) {
    const labelled = line.match(/^(?:candidate\s+)?name\s*[:\-–]\s*(.+)$/i)
    if (labelled?.[1]) candidates.unshift(labelled[1])
    else candidates.push(line.replace(/^(?:resume|curriculum vitae|cv)\s+(?:of|-|–|:)\s*/i, ''))
  }
  for (const raw of candidates) {
    const line = clean(raw.replace(/^(?:mr|mrs|ms|miss|dr|shri|smt)\.?\s+/i, ''))
    if (NON_NAME_LINE.test(line) || HEADING_RE.test(line)) continue
    if (EMAIL_RE.test(line) || /\d/.test(line) || ROLE_WORDS.test(line)) continue
    const words = line.split(' ')
    const wordOk = (w: string) => /^[A-Za-z][A-Za-z'’-]*\.?$/.test(w)
    if (words.length >= 2 && words.length <= 4 && words.every(wordOk)) {
      const flat = line === line.toUpperCase() || line === line.toLowerCase()
      const normal = flat ? toTitleCase(line) : line
      const [first, ...rest] = normal.split(' ')
      return { firstName: first ?? '', lastName: rest.join(' ') }
    }
  }
  return { firstName: '', lastName: '' }
}

// ─── Contacts ────────────────────────────────────────────────────────────────

const INDIAN_MOBILE_RE = /(?:\+?\s?91[\s().-]*)?\(?([6-9]\d{4})\)?[\s.-]?(\d{5})\b/
const GENERIC_PHONE_RE = /\+\d{1,3}[\s().-]*\d[\d\s().-]{7,14}\d/

function extractPhone(rawText: string): string | null {
  const text = rawText.replace(new RegExp(EMAIL_RE.source, 'gi'), ' ')
  const labelled = text.match(/(?:mobile|mob|phone|ph|contact|cell|tel)(?:\s*(?:no|number))?\.?\s*[:\-–]?\s*([+\d(][\d\s().+-]{8,18}\d)/i)
  const pick = (s: string | undefined) => {
    if (!s) return null
    const digits = s.replace(/\D/g, '')
    return digits.length >= 10 && digits.length <= 13 ? clean(s) : null
  }
  return (
    pick(labelled?.[1]) ??
    pick(text.match(INDIAN_MOBILE_RE)?.[0]) ??
    pick(text.match(GENERIC_PHONE_RE)?.[0]) ??
    null
  )
}

// ─── Dates, work history and experience ──────────────────────────────────────

const MONTH_PAT = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
const DATE_PAT = `(?:${MONTH_PAT}\\.?,?\\s+\\d{4}|\\d{1,2}[/.-]\\d{4}|\\d{4})`
const END_PAT = `(?:${DATE_PAT}|present|current|currently|till\\s+date|to\\s+date|till\\s+now|ongoing|now|date)`
const RANGE_RE = new RegExp(`(${DATE_PAT})\\s*(?:-|–|—|to|till|until)\\s*(${END_PAT})`, 'gi')

interface MonthPoint {
  year: number
  /** 0-11 */
  month: number
  yearOnly: boolean
}

function parsePoint(s: string, now: Date): MonthPoint | 'present' | null {
  const t = s.toLowerCase().trim()
  if (/^(?:present|current|currently|till|to|ongoing|now|date)/.test(t)) return 'present'
  const named = t.match(new RegExp(`^(${MONTH_PAT})[a-z]*\\.?,?\\s+(\\d{4})$`))
  if (named?.[1] && named[2]) {
    const idx = MONTHS.indexOf(named[1].slice(0, 3))
    return { year: Number(named[2]), month: idx, yearOnly: false }
  }
  const numeric = t.match(/^(\d{1,2})[/.-](\d{4})$/)
  if (numeric?.[1] && numeric[2]) {
    const m = Number(numeric[1])
    return m >= 1 && m <= 12 ? { year: Number(numeric[2]), month: m - 1, yearOnly: false } : null
  }
  const yearOnly = t.match(/^(\d{4})$/)
  if (yearOnly?.[1]) {
    const y = Number(yearOnly[1])
    return y >= 1970 && y <= now.getUTCFullYear() + 1 ? { year: y, month: 5, yearOnly: true } : null
  }
  return null
}

const monthIndex = (p: { year: number; month: number }) => p.year * 12 + p.month
const isoMonth = (p: { year: number; month: number }) => `${p.year}-${String(p.month + 1).padStart(2, '0')}`

interface Span {
  start: MonthPoint
  /** null = current */
  end: MonthPoint | null
  line: number
}

function findSpans(all: string[], from: number, to: number, now: Date): Span[] {
  const spans: Span[] = []
  const nowPoint: MonthPoint = { year: now.getUTCFullYear(), month: now.getUTCMonth(), yearOnly: false }
  for (let i = from; i < to; i++) {
    const line = all[i] as string
    if (DEGREE_RE.test(line) && !ROLE_WORDS.test(line)) continue
    for (const m of line.matchAll(RANGE_RE)) {
      const a = parsePoint(m[1] ?? '', now)
      const b = parsePoint(m[2] ?? '', now)
      if (!a || a === 'present' || !b) continue
      const end = b === 'present' ? null : b
      const effectiveEnd = end ?? nowPoint
      if (monthIndex(effectiveEnd) < monthIndex(a)) continue
      spans.push({ start: a, end, line: i })
    }
  }
  return spans
}

function totalMonths(spans: Span[], now: Date): number {
  const nowIdx = monthIndex({ year: now.getUTCFullYear(), month: now.getUTCMonth() })
  const ranges = spans
    .map((s) => [monthIndex(s.start), s.end ? monthIndex(s.end) : nowIdx] as const)
    .sort((x, y) => x[0] - y[0])
  let total = 0
  let curStart = -1
  let curEnd = -1
  for (const [s, e] of ranges) {
    if (curEnd < 0 || s > curEnd) {
      if (curEnd >= 0) total += curEnd - curStart
      curStart = s
      curEnd = e
    } else if (e > curEnd) {
      curEnd = e
    }
  }
  if (curEnd >= 0) total += curEnd - curStart
  return total
}

function sectionBounds(all: string[], heading: RegExp): [number, number] | null {
  const start = all.findIndex((l) => l.length <= 45 && heading.test(l))
  if (start < 0) return null
  let end = all.length
  for (let i = start + 1; i < all.length; i++) {
    const l = all[i] as string
    if (l.length <= 45 && HEADING_RE.test(l) && !heading.test(l)) {
      end = i
      break
    }
  }
  return [start + 1, end]
}

/** "Senior Engineer | Acme Pvt Ltd", "Engineer at Acme", "Acme - Engineer" -> role + company. */
function splitRoleCompany(raw: string): { role: string; company: string } | null {
  const line = clean(raw.replace(RANGE_RE, ' ').replace(/\(\s*\)/g, ' ').replace(/[()|]+\s*$/, ''))
  const parts = line.split(/\s+(?:at|@)\s+|\s*[|•·]\s*|\s+[-–—]\s+|,\s+/i).map(clean).filter(Boolean)
  if (parts.length < 2) return null
  // Narrative fragments ("Worked at ...", "Previously at ... as analyst") are not job-title lines.
  const NARRATIVE = /\b(as|worked|previously|currently|working|responsible|joined|was|were|since|from)\b/i
  const plausible = (p: string) => p.length <= 70 && p.split(' ').length <= 7 && !NARRATIVE.test(p)
  const roleIdx = parts.findIndex((p) => ROLE_WORDS.test(p) && plausible(p))
  if (roleIdx < 0) return null
  const role = parts[roleIdx] as string
  const company = parts.find((p, i) => i !== roleIdx && !ROLE_WORDS.test(p) && plausible(p) && !/\d{4}/.test(p))
  return company ? { role, company } : null
}

function extractWork(all: string[], now: Date): { entries: WorkEntry[]; spans: Span[] } {
  const bounds = sectionBounds(all, EXPERIENCE_HEADING_RE)
  const [from, to] = bounds ?? [0, all.length]
  const spans = findSpans(all, from, to, now)
  const entries: WorkEntry[] = []
  for (const span of spans) {
    // The role/company is on the date line itself or just above or below it.
    const neighbours = [span.line, span.line - 1, span.line + 1, span.line - 2]
    let found: { role: string; company: string } | null = null
    for (const n of neighbours) {
      if (n < from || n >= to) continue
      found = splitRoleCompany(all[n] as string)
      if (found) break
    }
    if (found) {
      entries.push({
        ...found,
        startDate: isoMonth(span.start),
        endDate: span.end ? isoMonth(span.end) : null,
      })
    }
  }
  return { entries, spans }
}

// ─── Stated facts ────────────────────────────────────────────────────────────

function extractStatedExperience(text: string): number | null {
  const num = String.raw`(\d{1,2}(?:\.\d{1,2})?)\s*\+?\s*(?:years?|yrs?)(?:\s*(?:and\s*)?(\d{1,2})\s*(?:months?|mos?))?`
  const near = [
    new RegExp(`(?:total|overall|relevant|work|professional)?\\s*experience[^.\\n\\d]{0,25}${num}`, 'i'),
    new RegExp(`${num}[^.\\n]{0,30}(?:of\\s+)?(?:\\w+\\s+){0,3}experience`, 'i'),
  ]
  for (const re of near) {
    const m = text.match(re)
    if (m?.[1]) return round1(Number(m[1]) + (m[2] ? Number(m[2]) / 12 : 0))
  }
  return null
}

function extractNoticeDays(text: string): number | null {
  const unit = (n: number, u: string) => (/month/i.test(u) ? n * 30 : /week/i.test(u) ? n * 7 : n)
  const a = text.match(/notice(?:\s*period)?[^.\n\d]{0,25}?(\d{1,3})\s*(days?|weeks?|months?)/i)
  if (a?.[1] && a[2]) return unit(Number(a[1]), a[2])
  const b = text.match(/(\d{1,3})\s*(days?|weeks?|months?)\s*(?:of\s*)?notice/i)
  if (b?.[1] && b[2]) return unit(Number(b[1]), b[2])
  if (/\b(?:immediate(?:ly)?\s*(?:joiner|joining|available)?|available\s+immediately|notice[^.\n]{0,20}immediate)\b/i.test(text)) return 0
  return null
}

function extractCtcLpa(text: string): number | null {
  const toLpa = (n: number, unit: string | undefined) => {
    const u = (unit ?? '').toLowerCase()
    if (/^(?:cr|crore)/.test(u)) return n * 100
    if (/^(?:lpa|lakh|lac|l$)/.test(u)) return n
    if (/^k/.test(u)) return n / 100
    return n >= 1000 ? n / 100000 : n
  }
  const find = (label: RegExp) => {
    const m = text.match(
      new RegExp(`${label.source}\\s*(?:ctc|salary|compensation)?[^\\d\\n]{0,15}(\\d+(?:[.,]\\d+)*)\\s*(lpa|lakhs?|lacs?|l\\b|crores?|cr\\b|k\\b)?`, 'i'),
    )
    if (!m?.[1]) return null
    const value = toLpa(Number(m[1].replace(/,/g, '')), m[2])
    return Number.isFinite(value) && value > 0 && value < 1000 ? round1(value) : null
  }
  return find(/expected/) ?? find(/(?:current|present|fixed)/)
}

// ─── Skills, education, location ─────────────────────────────────────────────

function extractSkills(text: string, all: string[]): string[] {
  const lower = text.toLowerCase()
  const found = new Set<string>()
  for (const skill of KNOWN_SKILLS) {
    const escaped = skill.replace(/[.+#/]/g, '\\$&')
    if (new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`).test(lower)) found.add(skill)
  }
  if (found.has('spring boot')) found.delete('spring')
  if (found.has('rest apis')) found.delete('rest')

  const fromList = (raw: string) => {
    for (const token of raw.split(/[,;|•·●▪•]|\s{2,}/)) {
      const t = clean(token.replace(/^[-–*]\s*/, '')).toLowerCase()
      if (t.length >= 2 && t.length <= 40 && t.split(' ').length <= 4 && !/[.:]$/.test(t) && !HEADING_RE.test(t)) found.add(t)
    }
  }
  const bounds = sectionBounds(all, SKILLS_HEADING_RE)
  if (bounds) {
    for (let i = bounds[0]; i < bounds[1]; i++) {
      const l = all[i] as string
      if (/^[A-Za-z][A-Za-z ]{1,24}:\s*\S/.test(l)) break
      fromList(l)
    }
  }
  for (const l of all) {
    const inline = l.match(/^(?:key |technical |core |it )?(?:skills|technologies|tech stack|tools)\s*(?:&\s*tools)?\s*[:\-–]\s*(.+)$/i)
    if (inline?.[1]) fromList(inline[1])
  }
  if (found.has('spring boot')) found.delete('spring')
  return [...found].slice(0, 40)
}

function extractEducation(all: string[]): EducationItem[] {
  const bounds = sectionBounds(all, EDUCATION_HEADING_RE)
  const [from, to] = bounds ?? [0, all.length]
  const out: EducationItem[] = []
  for (let i = from; i < to && out.length < 4; i++) {
    const line = all[i] as string
    if (!DEGREE_RE.test(line) || ROLE_WORDS.test(line)) continue
    const window = [line, i - 1 >= from ? all[i - 1] : undefined, i + 1 < to ? all[i + 1] : undefined].filter((x): x is string => !!x)
    const year = window.join(' ').match(/\b(19[89]\d|20[0-4]\d)\b(?!.*\b(19[89]\d|20[0-4]\d)\b)/)
    const institutionPart = window.flatMap((w) => w.split(/[,|]/)).find((part) => INSTITUTION_RE.test(part))
    const institution = institutionPart ? clean(institutionPart.replace(RANGE_RE, '').replace(/\b(19[89]\d|20[0-4]\d)\b/g, '')) : ''
    const degree = clean(line.replace(RANGE_RE, '').replace(/\b(19[89]\d|20[0-4]\d)\b/g, '').split(/[,|]/)[0] ?? line)
    out.push({
      degree: degree.slice(0, 80),
      institution: institution.slice(0, 100),
      graduationYear: year?.[1] ? Number(year[1]) : null,
    })
  }
  return out
}

function extractLocation(text: string): string | null {
  const m = text.match(/(?:current location|location|address|city|based in)\s*[:\-–]\s*([A-Za-z][A-Za-z ,.]{2,50})/i)
  return m?.[1] ? clean(m[1]).replace(/[,.]+$/, '') : null
}

// ─── Current role / headline ─────────────────────────────────────────────────

function fallbackCurrent(all: string[]): { role: string | null; company: string | null } {
  for (const line of all) {
    if (line.length > 100 || !ROLE_WORDS.test(line)) continue
    const found = splitRoleCompany(line)
    if (found) return found
  }
  return { role: null, company: null }
}

function extractHeadline(all: string[]): string {
  for (const line of all.slice(0, 10)) {
    if (line.length <= 80 && ROLE_WORDS.test(line) && !EMAIL_RE.test(line) && !/\d{4}/.test(line) && !/^(?:name|candidate)/i.test(line)) return clean(line)
  }
  return ''
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** `now` is injectable so tenure computed from "Present" is testable. */
export function extractProfile(rawText: string, now: Date = new Date()): ExtractedProfile {
  const all = lines(rawText)
  const { firstName, lastName } = extractName(all)
  const { entries, spans } = extractWork(all, now)

  const current = entries.find((e) => e.endDate === null) ?? entries[0]
  const fallback = current ? { role: null, company: null } : fallbackCurrent(all)

  const stated = extractStatedExperience(rawText)
  const computed = spans.length > 0 ? round1(totalMonths(spans, now) / 12) : null
  const experienceYears = stated ?? computed
  const headline = extractHeadline(all)

  return {
    firstName,
    lastName,
    email: rawText.match(EMAIL_RE)?.[0] ?? null,
    phone: extractPhone(rawText),
    headline: headline || current?.role || fallback.role || '',
    currentCompany: current?.company ?? fallback.company,
    currentRole: current?.role ?? fallback.role,
    location: extractLocation(rawText),
    skills: extractSkills(rawText, all),
    workHistory: entries,
    education: extractEducation(all),
    statedExperienceYears: stated,
    experienceYears,
    experienceSource: stated !== null ? 'stated' : computed !== null ? 'computed' : null,
    statedNoticeDays: extractNoticeDays(rawText),
    ctcLpa: extractCtcLpa(rawText),
  }
}
