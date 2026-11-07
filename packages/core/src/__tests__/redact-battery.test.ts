import { describe, it, expect } from 'vitest'
import { redact } from '../redact'

const CV = `Mr. Rahul Verma
Date of Birth - 12 March 1995 | Age: 29 | Gender - Male
Marital Status: Married
S/o Ramesh Verma
Father's Name: Ramesh Verma
Mobile +91-98765-43210  rahul.verma@example.com
Photo attached
SUMMARY
He is a Java developer. His team shipped 3 services and she (the manager) praised him.
Nationality: Indian
SKILLS
Java, Spring Boot, MS Excel, Kafka. Worked with the Sri Lanka office. Never miss a deadline.`

describe('redaction battery on a realistic CV', () => {
  const { redactedText: out } = redact(CV, { names: ['Rahul', 'Verma'] })

  it.each([
    ['name', 'Rahul'],
    ['surname', 'Verma'],
    ['title', 'Mr.'],
    ['date of birth', '1995'],
    ['age', 'Age: 29'],
    ['gender label', 'Male'],
    ['marital status', 'Married'],
    ['parent name', 'Ramesh'],
    ['phone', '98765'],
    ['email', '@example.com'],
    ['photo mention', 'Photo'],
    ['pronoun he', ' He '],
    ['pronoun his', ' His '],
    ['pronoun him', ' him'],
    ['pronoun she', 'she '],
    ['nationality', 'Indian'],
  ])('removes the %s', (_label, fragment) => {
    expect(out).not.toContain(fragment)
  })

  it('keeps what a scorer needs', () => {
    for (const keep of ['Java', 'Spring Boot', 'MS Excel', 'Kafka', 'Sri Lanka', 'miss a deadline', 'developer', 'services']) {
      expect(out).toContain(keep)
    }
  })

  it('leaves no title, pronoun or marital word behind', () => {
    expect(out).not.toMatch(/\b(?:he|she|him|his|her|married|unmarried|male|female)\b/i)
    expect(out).not.toMatch(/\b(?:Mr|Mrs|Ms)\b/)
  })

  it('does not swallow the section after a nationality line', () => {
    expect(out).toContain('SKILLS')
    expect(out).toMatch(/SKILLS\nJava, Spring Boot/)
  })
})

describe('other common layouts', () => {
  it('redacts Mrs and Miss titles and unlabelled marital words', () => {
    const { redactedText } = redact('Mrs. Priya Nair\nMiss Anita Rao\nUnmarried', { names: ['Priya', 'Nair'] })
    expect(redactedText).not.toMatch(/Mrs|Miss|Unmarried/)
  })

  it('redacts "Born on March 12, 1995" and "aged 29"', () => {
    const { redactedText } = redact('Born on March 12, 1995. Aged 29 years.')
    expect(redactedText).not.toMatch(/1995|29/)
  })

  it('does not treat ordinary words as personal data', () => {
    const text = 'Led single sign-on rollout; manager of the average team; worked 5 years on payments.'
    expect(redact(text).redactedText).toBe(text)
  })
})
