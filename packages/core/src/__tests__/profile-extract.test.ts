import { describe, it, expect } from 'vitest'
import { extractProfile } from '../profile-extract'

/** Fixed "today" so tenure computed from "Present" is deterministic. */
const NOW = new Date('2026-11-04T00:00:00Z')

// Layout 1: the seed/simple layout.
const SIMPLE = `Ritika Bansal
Senior Java Developer
ritika.bansal@example.com | +91 98765 43210
Location: Noida

Senior Java Developer at Acme Bank
Java, Spring Boot, microservices, Hibernate, REST APIs
6.5 years of experience. Notice period: 60 days.`

// Layout 2: conventional Indian resume with headings, dates, CTC and notice.
const INDIAN = `RITIKA BANSAL
Senior Software Engineer
Mobile: +91-98765-43210 | E-mail: ritika.bansal@example.com
Noida, Uttar Pradesh

PROFESSIONAL EXPERIENCE
Senior Software Engineer | Acme Technologies Pvt. Ltd. | Jan 2019 – Present
Built Spring Boot microservices for retail banking.
Software Engineer, Beta Corp (Jun 2015 – Dec 2018)
Maintained Java services.

EDUCATION
B.Tech (Computer Science), XYZ Institute of Technology, 2011 – 2015

TECHNICAL SKILLS
Java, Spring Boot, Microservices, Hibernate, REST APIs, Kafka

Current CTC: 18 LPA
Expected CTC: 24 LPA
Notice Period: 2 months`

// Layout 3: labelled fields, bullet skills, stated experience in years and months.
const LABELLED = `Curriculum Vitae
Name: Pooja Nair
Email : pooja.nair@example.com
Contact No. 9876543210
Current Location: Pune

Career Summary
Java Developer with 4 years 6 months of experience in backend development.

Skills
• Java
• Hibernate
• REST APIs

Notice: Immediate joiner`

// Layout 4: no headings, lower-case name, years-only dates, no stated experience.
const LOOSE = `arjun rawat
KYC Analyst
arjun.rawat@Example.com   9810012345
Worked at Orbit Financial Services 2021 - 2024 on KYC and AML checks
Previously at Meridian 2018 - 2021 as analyst
Tools: Excel`

describe('extractProfile: simple layout', () => {
  const p = extractProfile(SIMPLE, NOW)

  it('reads name, contacts and location', () => {
    expect(p).toMatchObject({ firstName: 'Ritika', lastName: 'Bansal', email: 'ritika.bansal@example.com', phone: '+91 98765 43210', location: 'Noida' })
  })

  it('reads current role, company, skills and the stated facts', () => {
    expect(p).toMatchObject({ currentRole: 'Senior Java Developer', currentCompany: 'Acme Bank', statedExperienceYears: 6.5, experienceYears: 6.5, experienceSource: 'stated', statedNoticeDays: 60 })
    expect(p.skills).toEqual(expect.arrayContaining(['java', 'spring boot', 'microservices', 'hibernate', 'rest apis']))
    expect(p.skills).not.toContain('spring')
  })
})

describe('extractProfile: Indian resume with dates', () => {
  const p = extractProfile(INDIAN, NOW)

  it('title-cases an all-caps name and reads the labelled phone', () => {
    expect(p).toMatchObject({ firstName: 'Ritika', lastName: 'Bansal', phone: '+91-98765-43210', email: 'ritika.bansal@example.com' })
  })

  it('builds work history from the experience section', () => {
    expect(p.workHistory).toEqual([
      { role: 'Senior Software Engineer', company: 'Acme Technologies Pvt. Ltd.', startDate: '2019-01', endDate: null },
      { role: 'Software Engineer', company: 'Beta Corp', startDate: '2015-06', endDate: '2018-12' },
    ])
    expect(p).toMatchObject({ currentRole: 'Senior Software Engineer', currentCompany: 'Acme Technologies Pvt. Ltd.' })
  })

  it('computes experience from the dates and does not count the degree years', () => {
    // Jun 2015-Dec 2018 (42 months) + Jan 2019-Nov 2026 (94 months) = 136 months = 11.3 years
    expect(p).toMatchObject({ statedExperienceYears: null, experienceYears: 11.3, experienceSource: 'computed' })
  })

  it('reads education, skills, CTC and notice', () => {
    expect(p.education).toEqual([{ degree: 'B.Tech (Computer Science)', institution: 'XYZ Institute of Technology', graduationYear: 2015 }])
    expect(p.skills).toEqual(expect.arrayContaining(['java', 'spring boot', 'kafka']))
    expect(p.skills.some((s) => s.includes('ctc'))).toBe(false) // the skills section ends at "Current CTC:"
    expect(p).toMatchObject({ ctcLpa: 24, statedNoticeDays: 60 })
  })
})

describe('extractProfile: labelled layout', () => {
  const p = extractProfile(LABELLED, NOW)

  it('uses labels and ignores the "Curriculum Vitae" title', () => {
    expect(p).toMatchObject({ firstName: 'Pooja', lastName: 'Nair', email: 'pooja.nair@example.com', phone: '9876543210', location: 'Pune' })
  })

  it('reads years-and-months experience and an immediate joiner', () => {
    expect(p).toMatchObject({ statedExperienceYears: 4.5, experienceSource: 'stated', statedNoticeDays: 0 })
  })

  it('reads a bulleted skills section', () => {
    expect(p.skills).toEqual(expect.arrayContaining(['java', 'hibernate', 'rest apis']))
  })
})

describe('extractProfile: loose layout', () => {
  const p = extractProfile(LOOSE, NOW)

  it('title-cases a lower-case name and finds the phone without a label', () => {
    expect(p).toMatchObject({ firstName: 'Arjun', lastName: 'Rawat', phone: '9810012345', email: 'arjun.rawat@Example.com' })
  })

  it('merges touching year-only ranges into 6 years', () => {
    expect(p).toMatchObject({ experienceYears: 6, experienceSource: 'computed' })
  })

  it('does not invent a role or company from narrative sentences', () => {
    expect(p.currentRole).toBeNull()
    expect(p.currentCompany).toBeNull()
    expect(p.workHistory).toEqual([])
    expect(p.headline).toBe('KYC Analyst')
  })

  it('reads the inline tools line', () => {
    expect(p.skills).toEqual(expect.arrayContaining(['excel', 'kyc', 'aml']))
  })
})

describe('extractProfile: details', () => {
  it('does not mistake digits inside an e-mail address for a phone number', () => {
    expect(extractProfile('A B\nuser9876543210@example.com', NOW).phone).toBeNull()
  })

  it('converts notice in weeks and months, and CTC in rupees and crores', () => {
    expect(extractProfile('Notice period: 3 weeks', NOW).statedNoticeDays).toBe(21)
    expect(extractProfile('Expected CTC: 1800000', NOW).ctcLpa).toBe(18)
    expect(extractProfile('Current CTC: 1.2 Cr', NOW).ctcLpa).toBe(120)
  })

  it('prefers expected CTC over current CTC', () => {
    expect(extractProfile('Current CTC: 10 LPA\nExpected CTC: 14 LPA', NOW).ctcLpa).toBe(14)
  })

  it('counts overlapping jobs once', () => {
    const t = `Experience\nDeveloper, Alpha Ltd (Jan 2020 – Dec 2021)\nConsultant, Beta Ltd (Jun 2021 – Dec 2022)`
    // Jan 2020 to Dec 2022 = 35 months = 2.9 years
    expect(extractProfile(t, NOW).experienceYears).toBe(2.9)
  })

  it('reads "Role, Company" and "Role - Company" lines when there is no experience section', () => {
    expect(extractProfile('Asha Rao\nBackend Engineer, Meridian Infosys\nJava', NOW)).toMatchObject({ currentRole: 'Backend Engineer', currentCompany: 'Meridian Infosys' })
    expect(extractProfile('Asha Rao\nJava Developer - Paragon Digital\nJava', NOW)).toMatchObject({ currentRole: 'Java Developer', currentCompany: 'Paragon Digital' })
  })

  it('returns empty values rather than inventing data from nothing', () => {
    expect(extractProfile('', NOW)).toMatchObject({
      firstName: '', lastName: '', email: null, phone: null, skills: [], workHistory: [], education: [],
      experienceYears: null, experienceSource: null, statedNoticeDays: null, ctcLpa: null, currentRole: null,
    })
    expect(extractProfile('asdf qwer 123', NOW).firstName).toBe('')
  })
})
