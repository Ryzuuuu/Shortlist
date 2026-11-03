import { describe, it, expect } from 'vitest'
import {
  validateUpload,
  MAX_FILE_SIZE_BYTES,
  PDF_MIME,
  DOCX_MIME,
} from '../upload-validation'

const pdfHead = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])
const zipHead = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14])
const exeHead = new Uint8Array([0x4d, 0x5a, 0x90, 0x00])

describe('validateUpload', () => {
  it('accepts a real PDF', () => {
    expect(
      validateUpload({ filename: 'cv.pdf', declaredMime: PDF_MIME, sizeBytes: 1000, head: pdfHead }),
    ).toEqual({ ok: true, mimeType: PDF_MIME })
  })

  it('accepts a DOCX and falls back to the extension for a generic MIME', () => {
    expect(
      validateUpload({
        filename: 'cv.DOCX',
        declaredMime: 'application/octet-stream',
        sizeBytes: 1000,
        head: zipHead,
      }),
    ).toEqual({ ok: true, mimeType: DOCX_MIME })
  })

  it('rejects empty files', () => {
    const r = validateUpload({ filename: 'a.pdf', declaredMime: PDF_MIME, sizeBytes: 0, head: pdfHead })
    expect(r).toMatchObject({ ok: false, reason: 'empty_file' })
  })

  it('rejects files over 4 MB, accepts exactly 4 MB', () => {
    const over = validateUpload({
      filename: 'a.pdf',
      declaredMime: PDF_MIME,
      sizeBytes: MAX_FILE_SIZE_BYTES + 1,
      head: pdfHead,
    })
    expect(over).toMatchObject({ ok: false, reason: 'file_too_large' })
    const at = validateUpload({
      filename: 'a.pdf',
      declaredMime: PDF_MIME,
      sizeBytes: MAX_FILE_SIZE_BYTES,
      head: pdfHead,
    })
    expect(at.ok).toBe(true)
  })

  it('rejects unsupported types', () => {
    const r = validateUpload({ filename: 'cv.exe', declaredMime: 'application/x-msdownload', sizeBytes: 10, head: exeHead })
    expect(r).toMatchObject({ ok: false, reason: 'unsupported_type' })
  })

  it('rejects a renamed executable (magic bytes mismatch)', () => {
    const r = validateUpload({ filename: 'cv.pdf', declaredMime: PDF_MIME, sizeBytes: 10, head: exeHead })
    expect(r).toMatchObject({ ok: false, reason: 'content_mismatch' })
  })
})
