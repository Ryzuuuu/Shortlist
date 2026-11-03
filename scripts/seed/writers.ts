/**
 * scripts/seed/writers.ts
 *
 * Dependency-light PDF and DOCX writers for synthetic seed CVs.
 * PDF is hand-assembled (one Helvetica text page); DOCX is a minimal OOXML zip.
 */
import JSZip from 'jszip'

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')

function assemblePdf(content: string): Buffer {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out))
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = Buffer.byteLength(out)
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

/** Text-layer PDF: one line per entry, top to bottom. */
export function makePdf(lines: string[]): Buffer {
  const body = lines
    .map((l, i) => `BT /F1 11 Tf 50 ${790 - i * 16} Td (${esc(l)}) Tj ET`)
    .join('\n')
  return assemblePdf(body)
}

/** Image-only style PDF: drawn boxes and no text layer, i.e. a scan stand-in. */
export function makeScannedPdf(): Buffer {
  return assemblePdf('0.9 g 50 400 495 340 re f\n0.2 g 70 700 300 6 re f\n70 680 380 6 re f')
}

/** A PDF header followed by truncated garbage: must fail to parse. */
export function makeBrokenPdf(): Buffer {
  return Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 99 0 R\n\u0000\u0001\u0002truncated', 'latin1')
}

export async function makeDocx(lines: string[]): Promise<Buffer> {
  const x = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const paras = lines.map((l) => `<w:p><w:r><w:t xml:space="preserve">${x(l)}</w:t></w:r></w:p>`).join('')
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  )
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  )
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras}</w:body></w:document>`,
  )
  return zip.generateAsync({ type: 'nodebuffer' })
}
