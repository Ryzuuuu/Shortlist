/**
 * packages/core/src/upload-validation.ts
 *
 * Pure validation for a single CV upload (one file per request, ASSUMPTION A3).
 * Checks size, declared MIME type and the file's magic bytes, so a renamed
 * .exe or an empty file is rejected before any parser runs.
 */

export const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024 // 4 MB

export const PDF_MIME = 'application/pdf'
export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([PDF_MIME, DOCX_MIME])

export type UploadRejection =
  | 'empty_file'
  | 'file_too_large'
  | 'unsupported_type'
  | 'content_mismatch'

export type UploadValidation =
  | { ok: true; mimeType: typeof PDF_MIME | typeof DOCX_MIME }
  | { ok: false; reason: UploadRejection; message: string }

const EXT_TO_MIME: Record<string, string> = {
  pdf: PDF_MIME,
  docx: DOCX_MIME,
}

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  return sig.every((b, i) => bytes[i] === b)
}

/** %PDF- */
function looksLikePdf(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])
}

/** DOCX is a ZIP container: PK\x03\x04 */
function looksLikeDocx(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])
}

/**
 * Validate an upload. The declared MIME type is trusted only as a hint: the
 * file extension is used when the browser sends a generic type, and the magic
 * bytes must always agree with the final type.
 */
export function validateUpload(input: {
  filename: string
  declaredMime: string
  sizeBytes: number
  head: Uint8Array
}): UploadValidation {
  if (input.sizeBytes <= 0) {
    return { ok: false, reason: 'empty_file', message: 'The file is empty.' }
  }
  if (input.sizeBytes > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      reason: 'file_too_large',
      message: 'Files must be 4 MB or smaller.',
    }
  }

  const ext = input.filename.split('.').pop()?.toLowerCase() ?? ''
  const mime = ALLOWED_MIME_TYPES.has(input.declaredMime)
    ? input.declaredMime
    : EXT_TO_MIME[ext]

  if (!mime || !ALLOWED_MIME_TYPES.has(mime)) {
    return {
      ok: false,
      reason: 'unsupported_type',
      message: 'Only PDF and DOCX files are accepted.',
    }
  }

  const matches = mime === PDF_MIME ? looksLikePdf(input.head) : looksLikeDocx(input.head)
  if (!matches) {
    return {
      ok: false,
      reason: 'content_mismatch',
      message: 'The file contents do not match its type.',
    }
  }

  return { ok: true, mimeType: mime as typeof PDF_MIME | typeof DOCX_MIME }
}
