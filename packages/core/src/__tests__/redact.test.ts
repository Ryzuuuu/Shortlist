import { describe, it, expect } from 'vitest'
import { redact, containsPii } from '../redact'

describe('redact', () => {
  describe('email', () => {
    it('redacts a plain email', () => {
      const { redactedText } = redact('Contact me at john.doe@example.com for details.')
      expect(redactedText).not.toContain('john.doe@example.com')
      expect(redactedText).toContain('[REDACTED:EMAIL]')
    })

    it('redacts multiple emails', () => {
      const { redactedText, stats } = redact('Primary: a@b.com, backup: c@d.org')
      expect(redactedText).not.toContain('@')
      expect(stats['email']).toBe(2)
    })
  })

  describe('phone', () => {
    it('redacts Indian mobile number', () => {
      const { redactedText } = redact('Mobile: +91 98765 43210')
      expect(redactedText).toContain('[REDACTED:PHONE]')
      expect(redactedText).not.toContain('98765')
    })

    it('redacts international format', () => {
      const { redactedText } = redact('Call +1-800-555-0199 anytime.')
      expect(redactedText).toContain('[REDACTED:PHONE]')
    })
  })

  describe('date of birth', () => {
    it('redacts DOB label with date', () => {
      const { redactedText } = redact('DOB: 15/08/1992')
      expect(redactedText).toContain('[REDACTED')
      expect(redactedText).not.toContain('1992')
    })

    it('redacts "Date of Birth: ..."', () => {
      const { redactedText } = redact('Date of Birth: 12 March 1990')
      expect(redactedText).toContain('[REDACTED')
      expect(redactedText).not.toContain('1990')
    })
  })

  describe('age', () => {
    it('redacts "age: 28"', () => {
      const { redactedText } = redact('Age: 28, seeking senior role')
      expect(redactedText).toContain('[REDACTED:AGE]')
      expect(redactedText).not.toContain('Age: 28')
    })

    it('redacts "28 years old"', () => {
      const { redactedText } = redact('I am 28 years old with 5 years experience.')
      expect(redactedText).toContain('[REDACTED:AGE]')
    })
  })

  describe('gender', () => {
    it('redacts "Gender: Male"', () => {
      const { redactedText } = redact('Gender: Male\nEducation: B.Tech')
      expect(redactedText).toContain('[REDACTED:GENDER]')
      expect(redactedText).not.toContain('Gender: Male')
    })

    it('redacts "Sex: Female"', () => {
      const { redactedText } = redact('Sex: Female')
      expect(redactedText).toContain('[REDACTED:GENDER]')
    })
  })

  describe('marital status', () => {
    it('redacts "Marital Status: Single"', () => {
      const { redactedText } = redact('Marital Status: Single')
      expect(redactedText).toContain('[REDACTED:MARITAL]')
    })

    it('redacts "Marital Status: Married"', () => {
      const { redactedText } = redact('Marital status: married, two children')
      expect(redactedText).toContain('[REDACTED:MARITAL]')
    })
  })

  describe('photo references', () => {
    it('redacts "Photograph attached"', () => {
      const { redactedText } = redact('Photograph attached. Experience: 5 years.')
      expect(redactedText).toContain('[REDACTED:PHOTO]')
    })
  })

  describe('clean text passthrough', () => {
    it('does not alter professional content', () => {
      const cv = 'Led a team of 10 engineers. Delivered 3 major product launches.'
      const { redactedText, stats } = redact(cv)
      expect(redactedText).toBe(cv)
      expect(Object.keys(stats).length).toBe(0)
    })
  })

  describe('containsPii', () => {
    it('returns true when PII is present', () => {
      expect(containsPii('Email: test@test.com')).toBe(true)
    })

    it('returns false when no PII detected', () => {
      expect(containsPii('Managed cloud infrastructure for 3 years.')).toBe(false)
    })
  })

  describe('combined PII', () => {
    it('redacts all PII fields from a realistic CV header', () => {
      const header = [
        'Priya Sharma',
        'Email: priya.sharma@gmail.com',
        'Phone: +91 99887 76655',
        'DOB: 10/04/1995',
        'Gender: Female',
        'Marital Status: Single',
      ].join('\n')

      const { redactedText } = redact(header)
      expect(redactedText).not.toContain('priya.sharma@gmail.com')
      expect(redactedText).not.toContain('99887')
      expect(redactedText).not.toContain('1995')
      expect(redactedText).toContain('[REDACTED:EMAIL]')
      expect(redactedText).toContain('[REDACTED:PHONE]')
      expect(redactedText).toContain('[REDACTED:GENDER]')
      expect(redactedText).toContain('[REDACTED:MARITAL]')
    })
  })
})
