/**
 * src/lib/ingestion/parse.ts
 *
 * CV file parsing: PDF (text-layer), DOCX, and scanned PDF detection.
 * No tesseract — scanned PDFs are flagged and handled by vision-LLM or
 * marked 'needs_review' (ASSUMPTION A4).
 */
import { createHash } from 'crypto'

export interface ParseResult {
  text: string
  isScanned: boolean
  contentHash: string
  /** True if the file could not be parsed at all */
  failed: boolean
  errorMessage?: string
}

const SCANNED_TEXT_THRESHOLD = 50 // chars — below this → treat as scanned

/**
 * Compute SHA-256 of file bytes.
 */
export function computeHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

/**
 * Parse a PDF buffer to text using pdf-parse (v2 class API).
 * Returns isScanned=true if extracted text is too short.
 */
async function parsePdf(buffer: Buffer): Promise<Omit<ParseResult, 'contentHash'>> {
  try {
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data: new Uint8Array(buffer) })
    let text: string
    try {
      text = ((await parser.getText()).text ?? '').trim()
    } finally {
      await parser.destroy()
    }

    if (text.length < SCANNED_TEXT_THRESHOLD) {
      return { text, isScanned: true, failed: false }
    }

    return { text, isScanned: false, failed: false }
  } catch (err) {
    return {
      text: '',
      isScanned: false,
      failed: true,
      errorMessage: err instanceof Error ? err.message : 'PDF parse failed',
    }
  }
}

/**
 * Parse a DOCX buffer to plain text using mammoth.
 */
async function parseDocx(buffer: Buffer): Promise<Omit<ParseResult, 'contentHash'>> {
  try {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    const text = result.value.trim()

    if (text.length < SCANNED_TEXT_THRESHOLD) {
      return { text, isScanned: true, failed: false }
    }

    return { text, isScanned: false, failed: false }
  } catch (err) {
    return {
      text: '',
      isScanned: false,
      failed: true,
      errorMessage: err instanceof Error ? err.message : 'DOCX parse failed',
    }
  }
}

/**
 * Parse a CV file buffer based on its MIME type.
 * Supported: application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document
 */
export async function parseCvFile(
  buffer: Buffer,
  mimeType: string,
): Promise<ParseResult> {
  const contentHash = computeHash(buffer)

  let partial: Omit<ParseResult, 'contentHash'>

  if (mimeType === 'application/pdf') {
    partial = await parsePdf(buffer)
  } else if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    partial = await parseDocx(buffer)
  } else {
    partial = {
      text: '',
      isScanned: false,
      failed: true,
      errorMessage: `Unsupported MIME type: ${mimeType}`,
    }
  }

  return { ...partial, contentHash }
}

export { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from '@shortlist/core'
