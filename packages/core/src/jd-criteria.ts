/**
 * packages/core/src/jd-criteria.ts
 *
 * Deterministic job-description -> scorecard criteria. This is the default (no API
 * key) way a JD becomes an editable scorecard, and the safety net when a model's
 * answer is unusable. It reads what the JD says and never adds a requirement it
 * does not state; the recruiter edits the result before anything is scored.
 *
 * Rules, in order:
 *  - every known skill named in the JD becomes a criterion (see skills.ts)
 *  - a skill is a MUST-HAVE if it is named in the opening sentence (the role itself),
 *    or in a sentence that says must / required / mandatory / essential / strong ...
 *  - list phrases ("experience in X, Y and Z", "skills: ...") add skills outside the vocabulary
 *  - seniority (senior / lead / principal / head) and an education requirement are criteria
 *  - when a JD names few technical skills (a non-technical role), the duties it lists become criteria
 *  - experience, notice, CTC and location are NOT criteria: they are filters (jd-filters.ts)
 */
import { findSkills, skillIndex, skillLabel } from './skills'

export interface JdCriterion {
  label: string
  description: string
  /** 0-1, all weights sum to 1 */
  weight: number
  mustHave: boolean
}

const MAX_CRITERIA = 8
const MUST_RE = /\b(must|required|requirements?|mandatory|essential|strong|expert(?:ise)?|proficien\w*|hands-on|minimum)\b/i
const LIST_INTRO =
  /(?:skills?|technolog(?:y|ies)|tech stack|tools?|experience (?:in|with)|expertise in|proficien\w* (?:in|with)|knowledge of|hands-on (?:experience )?(?:in|with)|familiar(?:ity)? with)\s*[:\-]?\s*([^.\n;]{3,160})/gi
const SENIORITY_RE = /\b(senior|sr\.?|lead|principal|head|staff)\b/i
const EDUCATION_RE = /\b(b\.?\s?tech|b\.?\s?e\.?|m\.?\s?tech|mba|pgdm|b\.?\s?sc|m\.?\s?sc|b\.?\s?com|m\.?\s?com|bca|mca|graduate|graduation|degree|bachelor'?s?|master'?s?|diploma)\b/i
const DUTY_INTRO = /(?:you will|responsibilities(?: include)?|duties(?: include)?|role involves|will be responsible for)\s*[:\-]?\s*([^.\n]{10,220})/i
const STOP = new Set(['and', 'or', 'the', 'a', 'an', 'of', 'to', 'in', 'with', 'for', 'on', 'etc', 'other', 'good', 'strong', 'basic', 'knowledge', 'experience', 'skills', 'ability'])

const sentences = (text: string) =>
  text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)

/** Items from a comma / "and" list, trimmed to short noun phrases. */
function listItems(raw: string): string[] {
  return raw
    .split(/,|;|\band\b|&|\//i)
    .map((s) => s.replace(/\b(?:etc|such as|like|including)\b/gi, '').replace(/^[\s\-–•]+|[\s.\-–•]+$/g, '').trim())
    .filter((s) => s.length >= 2 && s.length <= 40 && s.split(/\s+/).length <= 4 && !STOP.has(s.toLowerCase()) && !/\d/.test(s))
}

interface Draft {
  key: string
  label: string
  description: string
  mustHave: boolean
  kind: 'skill' | 'seniority' | 'education' | 'duty' | 'other'
}

export function extractJdCriteria(jd: string): JdCriterion[] {
  const text = jd.trim()
  if (!text) return []
  const parts = sentences(text)
  const first = parts[0] ?? ''
  const drafts: Draft[] = []
  const seen = new Set<string>()
  const add = (d: Draft) => {
    if (seen.has(d.key) || drafts.length >= 30) return
    seen.add(d.key)
    drafts.push(d)
  }

  // 1. Known skills, with must-have decided from context.
  for (const skill of findSkills(text)) {
    const inFirst = skillIndex(first.toLowerCase(), skill) !== -1
    const inMustSentence = parts.some((p) => MUST_RE.test(p) && skillIndex(p.toLowerCase(), skill) !== -1)
    add({ key: skill, label: skillLabel(skill), description: skillLabel(skill), mustHave: inFirst || inMustSentence, kind: 'skill' })
  }

  // 2. Skills named in list phrases but outside the vocabulary.
  for (const m of text.matchAll(LIST_INTRO)) {
    for (const item of listItems(m[1] ?? '')) {
      const k = item.toLowerCase()
      if ([...seen].some((s) => s === k || s.includes(k) || k.includes(s))) continue
      const inMust = MUST_RE.test(m[0])
      add({ key: k, label: item.replace(/(^|\s)([a-z])/g, (_x, p: string, c: string) => p + c.toUpperCase()), description: item, mustHave: inMust, kind: 'skill' })
    }
  }

  // 3. Seniority and education.
  const senior = first.match(SENIORITY_RE) ?? text.match(SENIORITY_RE)
  if (senior) add({ key: 'seniority', label: 'Seniority', description: senior[1] ?? 'senior', mustHave: false, kind: 'seniority' })
  const education = text.match(EDUCATION_RE)
  if (education) add({ key: 'education', label: 'Education', description: education[1] ?? 'degree', mustHave: /\b(required|must|mandatory)\b/i.test(sentences(text).find((p) => EDUCATION_RE.test(p)) ?? ''), kind: 'education' })

  // 4. A non-technical role: take the duties the JD lists.
  const skillCount = drafts.filter((d) => d.kind === 'skill').length
  if (skillCount < 3) {
    const duty = text.match(DUTY_INTRO)?.[1]
    for (const item of duty ? listItems(duty).slice(0, 4) : []) {
      const k = item.toLowerCase()
      if ([...seen].some((s) => s === k || k.includes(s))) continue
      add({ key: k, label: item.replace(/(^|\s)([a-z])/g, (_x, p: string, c: string) => p + c.toUpperCase()), description: item, mustHave: false, kind: 'duty' })
    }
  }

  // 5. Nothing recognisable: fall back to the role itself so there is something to edit.
  if (drafts.length === 0) {
    const title = first.split(/[,.:;-]/)[0]?.trim().slice(0, 60) ?? ''
    if (title.length >= 3) add({ key: 'role', label: title, description: title, mustHave: true, kind: 'other' })
  }

  // Order: must-haves first, then the rest in the order they appeared; cap the list.
  const picked = [...drafts.filter((d) => d.mustHave), ...drafts.filter((d) => !d.mustHave)].slice(0, MAX_CRITERIA)

  // Weights: must-have 3, skill 2, duty 1.5, seniority 1.5, education 1.
  const raw = picked.map((d) => (d.mustHave ? 3 : d.kind === 'skill' ? 2 : d.kind === 'duty' || d.kind === 'seniority' ? 1.5 : 1))
  const total = raw.reduce((s, w) => s + w, 0)
  const weights = raw.map((w) => Math.round((w / total) * 100) / 100)
  // Put any rounding remainder on the first criterion so the weights sum to exactly 1.
  const remainder = Math.round((1 - weights.reduce((s, w) => s + w, 0)) * 100) / 100
  if (weights.length > 0) weights[0] = Math.round(((weights[0] as number) + remainder) * 100) / 100

  return picked.map((d, i) => ({ label: d.label, description: d.description, weight: weights[i] as number, mustHave: d.mustHave }))
}
