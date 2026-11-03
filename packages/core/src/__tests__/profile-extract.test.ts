import { describe, it, expect } from 'vitest'
import { extractProfile } from '../profile-extract'

const CV = `Ritika Bansal
Senior Java Developer
ritika.bansal@example.com | +91 98765 43210
Location: Noida

Senior Java Developer at Acme Bank
Java, Spring Boot, microservices, Hibernate, REST APIs
6.5 years of experience. Notice period: 60 days.`

describe('extractProfile', () => {
  const p = extractProfile(CV)

  it('reads name, contacts and location from the text', () => {
    expect(p.firstName).toBe('Ritika')
    expect(p.lastName).toBe('Bansal')
    expect(p.email).toBe('ritika.bansal@example.com')
    expect(p.phone).toBe('+91 98765 43210')
    expect(p.location).toBe('Noida')
  })

  it('reads current role and company', () => {
    expect(p.currentRole).toBe('Senior Java Developer')
    expect(p.currentCompany).toBe('Acme Bank')
  })

  it('finds skills without double-counting generic terms', () => {
    expect(p.skills).toEqual(expect.arrayContaining(['java', 'spring boot', 'microservices', 'hibernate', 'rest apis']))
    expect(p.skills).not.toContain('spring')
  })

  it('reads stated experience and notice period only when present', () => {
    expect(p.statedExperienceYears).toBe(6.5)
    expect(p.statedNoticeDays).toBe(60)
    const bare = extractProfile('Some Person\nAnalyst\nKYC, AML checks')
    expect(bare.statedExperienceYears).toBeNull()
    expect(bare.statedNoticeDays).toBeNull()
    expect(bare.skills).toEqual(expect.arrayContaining(['kyc', 'aml']))
  })

  it('converts notice in months to days', () => {
    expect(extractProfile('A B\nNotice period: 2 months').statedNoticeDays).toBe(60)
  })

  it('returns empty fields rather than inventing data', () => {
    const e = extractProfile('')
    expect(e).toMatchObject({ firstName: '', email: null, phone: null, skills: [] })
  })
})
