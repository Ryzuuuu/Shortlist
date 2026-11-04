import { describe, it, expect } from 'vitest'
import { stripPageFooters } from '../text-clean'

describe('stripPageFooters', () => {
  it('removes a page footer line and keeps the CV text', () => {
    const text = 'Ritika Bansal\nSKILLS\nJava, Spring Boot\n\n-- 1 of 1 --'
    expect(stripPageFooters(text)).toBe('Ritika Bansal\nSKILLS\nJava, Spring Boot')
  })

  it('removes the footer of every page of a multi-page CV', () => {
    const text = 'Page one text\n-- 1 of 2 --\nPage two text\n-- 2 of 2 --'
    expect(stripPageFooters(text)).toBe('Page one text\n\nPage two text')
  })

  it('does not touch a sentence that merely contains "of"', () => {
    const text = 'Delivered 3 of 4 modules -- on time'
    expect(stripPageFooters(text)).toBe(text)
  })

  it('is idempotent', () => {
    const once = stripPageFooters('A\n-- 1 of 1 --')
    expect(stripPageFooters(once)).toBe(once)
  })
})
