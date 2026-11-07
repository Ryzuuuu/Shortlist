import { describe, it, expect } from 'vitest'
import { extractProfile } from '../profile-extract'

const NOW = new Date('2026-11-01T00:00:00Z')
const p = (text: string) => extractProfile(text, NOW)

describe('profile extraction across varied CV layouts', () => {
  it('reads a labelled name, a labelled role and a month-based notice period', () => {
    const r = p('Name: Sanjay Kumar Gupta\nEmail: sanjay.gupta@example.com\nMobile: 098765 43210\nCurrent Role: Java Developer\nExperience: 5 years\nNotice Period: 2 months\nCurrent CTC: 18 LPA\nLocation: Noida')
    expect(`${r.firstName} ${r.lastName}`).toBe('Sanjay Kumar Gupta')
    expect(r.headline).toBe('Java Developer')
    expect(r.statedNoticeDays).toBe(60)
    expect(r.experienceYears).toBe(5)
    expect(r.location).toBe('Noida')
  })

  it('reads an ALL CAPS name', () => {
    const r = p('SANJAY KUMAR GUPTA\nSenior Java Developer\n+91 98765 43210 | sanjay@example.com\nSKILLS\nJava, Spring Boot')
    expect(r.firstName).toBe('Sanjay')
    expect(r.lastName).toBe('Kumar Gupta')
  })

  it('skips a "Curriculum Vitae" header and computes experience from "Present"', () => {
    const r = p('CURRICULUM VITAE\n\nPriya Nair\nPune\nEmail: PRIYA.NAIR@Example.COM\n\nWORK EXPERIENCE\nSoftware Engineer, Infosys Ltd.\nJan 2018 - Present\nEDUCATION\nB.Tech Computer Science, VIT, 2017')
    expect(r.firstName).toBe('Priya')
    expect(r.currentCompany).toBe('Infosys Ltd.')
    expect(r.experienceYears).toBeGreaterThan(8)
  })

  it('does not count education years as work', () => {
    const r = p('Neha Joshi\nneha.joshi@example.com\nEDUCATION\nB.Tech Information Technology, 2020 - 2024\nSKILLS\nJava')
    expect(r.experienceYears).toBeNull()
  })

  it('reads an address line and picks the city, not the street', () => {
    const r = p('Manish Tripathi\nmanish.t@example.com\nAddress: Sector 62, Noida, Uttar Pradesh 201301\nSenior Java Developer, 6.5 years.')
    expect(r.location).toBe('Noida')
  })

  it('never reports a duration as the company', () => {
    const r = p('Manish Tripathi\nmanish.t@example.com\nSenior Java Developer, 6.5 years.')
    expect(r.currentCompany).toBeNull()
  })

  it('reads experience stated only in months', () => {
    expect(p('Tara Das\ntara.das@example.com\nWork experience: 8 months\nSkills: Java').experienceYears).toBe(0.7)
  })

  it('reads immediate joiners, serving notice, and expected CTC', () => {
    expect(p('Rohit Mehta\nrohit@example.com\nNotice Period: Immediate\nExpected CTC: 32 LPA').statedNoticeDays).toBe(0)
    expect(p('Divya Iyer\ndivya@example.com\nCurrently serving notice. Notice: 30 days.').statedNoticeDays).toBe(30)
    expect(p('Faisal Khan\nf@example.com\nCurrent CTC: Rs. 14.5 Lakhs\nExpected CTC: 18 LPA').ctcLpa).toBe(18)
  })

  it('handles Indian phone formats', () => {
    for (const phone of ['098765 43210', '(+91) 98765 43210', '91-9876543210', '+91-9447012345']) {
      expect(p(`Amit Sharma\namit@example.com\n${phone}\nJava`).phone).not.toBeNull()
    }
  })

  it('reads skills from bullet and pipe layouts', () => {
    const r = p('Meera Pillai\nmeera@example.com\n▪ Java ▪ Spring Boot ▪ REST ▪ MySQL')
    expect(r.skills).toEqual(expect.arrayContaining(['java', 'spring boot']))
    const t = p('R. K. Menon\nrk@example.com\nTechnical Skills: Java | Spring | Hibernate | Oracle')
    expect(t.skills).toEqual(expect.arrayContaining(['java', 'hibernate', 'oracle']))
  })

  it('drops a title in front of the name', () => {
    const r = p('Mrs. Sunita Reddy\nsunita@example.com\nHyderabad\nSoftware Developer at Accenture')
    expect(r.firstName).toBe('Sunita')
  })
})
