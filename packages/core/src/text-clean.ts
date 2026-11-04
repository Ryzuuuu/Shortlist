/**
 * packages/core/src/text-clean.ts
 *
 * Small clean-ups applied to text pulled out of a CV file, before it is stored or read.
 */

/**
 * PDF text extractors add a "-- 1 of 2 --" line for each page. It is not part of the CV,
 * so it must not appear in the reader, in profile extraction, or inside a quoted piece of evidence.
 */
const PAGE_FOOTER = /^[ \t]*--[ \t]*\d+[ \t]+of[ \t]+\d+[ \t]*--[ \t]*$/gm

export function stripPageFooters(text: string): string {
  return text.replace(PAGE_FOOTER, '').replace(/\n{3,}/g, '\n\n').trim()
}
