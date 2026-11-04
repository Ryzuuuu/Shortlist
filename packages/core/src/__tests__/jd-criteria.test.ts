import { describe, expect, it } from 'vitest'
import { extractJdCriteria } from '../jd-criteria'
import { findCity, findSkills, skillLabel } from '../skills'

const EXAMPLE = 'Senior Java Developer, 5-8 years, Spring Boot, Noida, notice up to 60 days'
const KYC =
  'We are hiring a KYC Analyst for our banking back-office team in Noida. You will run KYC and AML checks, maintain customer records in Excel and escalate exceptions. 2-4 years of experience. Notice period up to 30 days. Budget 6-9 LPA.'

const sum = (cs: Array<{ weight: number }>) => Math.round(cs.reduce((s, c) => s + c.weight, 0) * 100) / 100

describe("extractJdCriteria on the brief's example JD", () => {
  const c = extractJdCriteria(EXAMPLE)

  it('turns the role, its skills and its seniority into criteria', () => {
    expect(c.map((x) => x.label)).toEqual(['Java', 'Spring Boot', 'Seniority'])
  })

  it('treats the skills named in the role line as must-haves', () => {
    expect(c.map((x) => x.mustHave)).toEqual([true, true, false])
  })

  it('weights sum to exactly 1, with must-haves weighted higher', () => {
    expect(sum(c)).toBe(1)
    expect(c[0]!.weight).toBeGreaterThan(c[2]!.weight)
  })

  it('does not turn experience, notice or location into criteria (those are filters)', () => {
    const labels = c.map((x) => x.label.toLowerCase()).join(' ')
    expect(labels).not.toMatch(/year|notice|noida|60|5-8/)
  })
})

describe('extractJdCriteria on other JDs', () => {
  it('reads a non-technical role: skills from the vocabulary, with the first-sentence skill as the must-have', () => {
    const c = extractJdCriteria(KYC)
    expect(c.map((x) => x.label)).toEqual(['KYC', 'AML checks', 'Excel'])
    expect(c.map((x) => x.mustHave)).toEqual([true, false, false])
    expect(sum(c)).toBe(1)
  })

  it('decides must-have from context words, not position alone', () => {
    const c = extractJdCriteria('We are hiring a backend engineer. Must have strong Python and Django. Nice to have Docker and AWS.')
    const must = Object.fromEntries(c.map((x) => [x.label, x.mustHave]))
    expect(must).toMatchObject({ Python: true, Django: true, Docker: false, AWS: false })
  })

  it('picks up skills outside the vocabulary from "experience in ..." lists', () => {
    const c = extractJdCriteria('We need a Treasury Analyst with experience in Letters of Credit, Forex and Trade Finance.')
    expect(c.map((x) => x.label)).toEqual(expect.arrayContaining(['Letters Of Credit', 'Forex', 'Trade Finance']))
  })

  it('adds an education criterion, a must-have when the JD says required', () => {
    const c = extractJdCriteria('Senior QA Lead. B.Tech required. Selenium and Cypress.')
    expect(c.find((x) => x.label === 'Education')).toMatchObject({ mustHave: true })
    expect(c.map((x) => x.label)).toEqual(expect.arrayContaining(['Selenium', 'Cypress', 'Seniority']))
  })

  it('falls back to the role itself when nothing else is recognisable, so there is something to edit', () => {
    const c = extractJdCriteria('Hiring a Store Manager')
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ label: 'Hiring a Store Manager', mustHave: true, weight: 1 })
  })

  it('caps the list at 8 criteria, keeping the must-haves', () => {
    const jd = 'Java, Spring Boot, Hibernate, Kafka, Docker, Kubernetes, AWS, SQL, Redis, Jenkins, Maven, Git. Strong Python.'
    const c = extractJdCriteria(jd)
    expect(c).toHaveLength(8)
    expect(c.filter((x) => x.mustHave).length).toBeGreaterThan(0)
    expect(sum(c)).toBe(1)
  })

  it('returns nothing for an empty JD', () => {
    expect(extractJdCriteria('')).toEqual([])
    expect(extractJdCriteria('   ')).toEqual([])
  })
})

describe('skills and cities', () => {
  it('matches whole words only', () => {
    expect(findSkills('JavaScript developer with an interest in forests')).toEqual(['javascript'])
    expect(findSkills('Java and Spring Boot')).toEqual(['java', 'spring boot'])
  })

  it('names skills the way people write them', () => {
    expect(skillLabel('spring boot')).toBe('Spring Boot')
    expect(skillLabel('aws')).toBe('AWS')
    expect(skillLabel('rest apis')).toBe('REST APIs')
  })

  it('finds a city as a whole word', () => {
    expect(findCity('Based in noida, Uttar Pradesh')).toBe('noida')
    expect(findCity('Bengaluru office')).toBe('Bengaluru')
    expect(findCity('Noidaville')).toBeNull()
  })
})
