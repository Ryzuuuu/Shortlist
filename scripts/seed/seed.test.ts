import { describe, it, expect, beforeAll } from 'vitest'
import {
  DOCX_MIME,
  PDF_MIME,
  extractProfile,
  findDuplicate,
  normaliseEmail,
  normalisePhone,
  type DedupCandidate,
} from '@shortlist/core'
import { parseCvFile, type ParseResult } from '@/lib/ingestion/parse'
import { buildSeedCvs, type SeedCv } from './cv-data'

function toDedup(id: string, text: string): DedupCandidate {
  const e = extractProfile(text)
  return {
    id,
    normalisedEmail: normaliseEmail(e.email),
    normalisedPhone: normalisePhone(e.phone),
    identity: {
      fullName: `${e.firstName} ${e.lastName}`.trim(),
      currentCompany: e.currentCompany,
      currentRole: e.currentRole,
    },
  }
}

describe('seed CVs', () => {
  let parsed: Array<{ c: SeedCv; r: ParseResult }> = []

  beforeAll(async () => {
    const cvs = await buildSeedCvs()
    parsed = await Promise.all(
      cvs.map(async (c) => ({
        c,
        r: await parseCvFile(c.data, c.filename.endsWith('.docx') ? DOCX_MIME : PDF_MIME),
      })),
    )
  })

  it('has about 40 files with the requested edge cases', () => {
    expect(parsed.length).toBeGreaterThanOrEqual(40)
    expect(parsed.filter((p) => p.c.kind === 'duplicate')).toHaveLength(2)
    expect(parsed.filter((p) => p.c.kind === 'scanned')).toHaveLength(1)
    expect(parsed.filter((p) => p.c.kind === 'broken')).toHaveLength(1)
  })

  it('parses normal CVs, flags the scan, fails the broken file', () => {
    for (const { c, r } of parsed) {
      if (c.kind === 'broken') expect(r.failed, c.filename).toBe(true)
      else if (c.kind === 'scanned') expect(r, c.filename).toMatchObject({ failed: false, isScanned: true })
      else expect(r, c.filename).toMatchObject({ failed: false, isScanned: false })
    }
  })

  it('extracts a name and email from every readable CV', () => {
    for (const { c, r } of parsed.filter((p) => p.c.kind === 'normal' || p.c.kind === 'duplicate')) {
      const p = extractProfile(r.text)
      expect(p.firstName, c.filename).not.toBe('')
      expect(p.email, c.filename).not.toBeNull()
    }
  })

  it('the two duplicates match their originals by email and by phone', () => {
    const pool = parsed.filter((p) => p.c.kind === 'normal').map((p, i) => toDedup(String(i), p.r.text))
    const reasons = parsed
      .filter((p) => p.c.kind === 'duplicate')
      .map((p) => findDuplicate(toDedup('', p.r.text), pool)?.reason)
    expect(reasons).toEqual(['email', 'phone'])
  })
})
