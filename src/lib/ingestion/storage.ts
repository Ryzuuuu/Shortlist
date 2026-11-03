/**
 * src/lib/ingestion/storage.ts
 *
 * CV file storage. Vercel Blob when BLOB_READ_WRITE_TOKEN is set; otherwise a
 * local .uploads/ folder so the app runs with no external services in dev.
 * Keys are opaque strings stored in cv_files.storage_url.
 */
import { mkdir, readFile, writeFile, rm } from 'fs/promises'
import path from 'path'

const LOCAL_DIR = path.join(process.cwd(), '.uploads')
const blobEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN)

export async function putFile(id: string, filename: string, data: Buffer): Promise<string> {
  if (blobEnabled()) {
    const { put } = await import('@vercel/blob')
    const blob = await put(`cvs/${id}/${filename}`, data, { access: 'private', addRandomSuffix: true })
    return blob.url
  }
  await mkdir(LOCAL_DIR, { recursive: true })
  const key = `local:${id}`
  await writeFile(path.join(LOCAL_DIR, id), data)
  return key
}

export async function getFile(key: string): Promise<Buffer> {
  if (key.startsWith('local:')) {
    return readFile(path.join(LOCAL_DIR, key.slice('local:'.length)))
  }
  const { get } = await import('@vercel/blob')
  const res = await get(key, { access: 'private' })
  if (!res || res.statusCode !== 200) throw new Error('Stored file not found')
  return Buffer.from(await new Response(res.stream).arrayBuffer())
}

export async function deleteFile(key: string): Promise<void> {
  if (key.startsWith('local:')) {
    await rm(path.join(LOCAL_DIR, key.slice('local:'.length)), { force: true })
    return
  }
  const { del } = await import('@vercel/blob')
  await del(key)
}
