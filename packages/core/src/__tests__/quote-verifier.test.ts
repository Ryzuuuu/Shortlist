import { describe, it, expect } from 'vitest'
import { verifyQuote, verifyQuotes, normalise } from '../quote-verifier'

describe('normalise', () => {
  it('lowercases text', () => {
    expect(normalise('Hello World')).toBe('hello world')
  })

  it('collapses multiple spaces', () => {
    expect(normalise('foo   bar')).toBe('foo bar')
  })

  it('collapses newlines and tabs to single space', () => {
    expect(normalise('foo\n\tbar')).toBe('foo bar')
  })

  it('trims leading/trailing whitespace', () => {
    expect(normalise('  hello  ')).toBe('hello')
  })
})

describe('verifyQuote', () => {
  const source = 'Led a team of 10 engineers at Acme Corp. Delivered 3 projects on time.'

  it('verifies an exact substring', () => {
    const result = verifyQuote('Led a team of 10 engineers', source)
    expect(result.verified).toBe(true)
  })

  it('verifies case-insensitive match', () => {
    const result = verifyQuote('LED A TEAM OF 10 ENGINEERS', source)
    expect(result.verified).toBe(true)
  })

  it('verifies despite extra whitespace in quote', () => {
    const result = verifyQuote('Delivered  3  projects', source)
    expect(result.verified).toBe(true)
  })

  it('fails for text not in source', () => {
    const result = verifyQuote('managed a budget of $5M', source)
    expect(result.verified).toBe(false)
    expect(result.reason).toContain('not found')
  })

  it('fails for null quote', () => {
    const result = verifyQuote(null, source)
    expect(result.verified).toBe(false)
    expect(result.reason).toContain('empty or null')
  })

  it('fails for empty string quote', () => {
    const result = verifyQuote('', source)
    expect(result.verified).toBe(false)
  })

  it('fails for whitespace-only quote', () => {
    const result = verifyQuote('   ', source)
    expect(result.verified).toBe(false)
  })

  it('verifies across line boundaries in source', () => {
    const multiLineSource = 'Experience:\nReact, TypeScript\nNode.js'
    const result = verifyQuote('React, TypeScript', multiLineSource)
    expect(result.verified).toBe(true)
  })
})

describe('verifyQuotes (batch)', () => {
  const source = 'Managed AWS infrastructure. Built CI/CD pipelines. Led team of 5.'

  it('verifies multiple quotes', () => {
    const results = verifyQuotes(
      ['Managed AWS infrastructure', 'Built CI/CD pipelines'],
      source,
    )
    expect(results[0].verified).toBe(true)
    expect(results[1].verified).toBe(true)
  })

  it('returns false for quotes not found', () => {
    const results = verifyQuotes(['reduced costs by 40%', null], source)
    expect(results[0].verified).toBe(false)
    expect(results[1].verified).toBe(false)
  })

  it('handles mixed valid and invalid quotes', () => {
    const results = verifyQuotes(
      ['Led team of 5', 'invented the internet'],
      source,
    )
    expect(results[0].verified).toBe(true)
    expect(results[1].verified).toBe(false)
  })
})
