'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MAX_FILE_SIZE_BYTES } from '@shortlist/core'
import { Badge, Button } from '@/components/ui'

const CONCURRENCY = 4
const MAX_FILES = 500
const ACCEPT = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

type Status = 'queued' | 'uploading' | 'scored' | 'needs_review' | 'failed' | 'rejected'

interface Item {
  key: string
  file: File
  status: Status
  message?: string
}

const LABEL: Record<Status, { text: string; variant: 'muted' | 'default' | 'success' | 'warning' | 'error' }> = {
  queued: { text: 'Queued', variant: 'muted' },
  uploading: { text: 'Processing', variant: 'default' },
  scored: { text: 'Scored', variant: 'success' },
  needs_review: { text: 'Needs review', variant: 'warning' },
  failed: { text: 'Failed', variant: 'error' },
  rejected: { text: 'Rejected', variant: 'error' },
}

function precheck(file: File): string | null {
  if (file.size === 0) return 'The file is empty.'
  if (file.size > MAX_FILE_SIZE_BYTES) return 'Larger than 4 MB.'
  if (!/\.(pdf|docx)$/i.test(file.name)) return 'Only PDF and DOCX files.'
  return null
}

export function UploadZone({ requisitionId }: { requisitionId: string }) {
  const router = useRouter()
  const [items, setItems] = useState<Item[]>([])
  const [running, setRunning] = useState(false)
  const [over, setOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const patch = useCallback((key: string, p: Partial<Item>) => {
    setItems((all) => all.map((i) => (i.key === key ? { ...i, ...p } : i)))
  }, [])

  const send = useCallback(
    async (item: Item) => {
      patch(item.key, { status: 'uploading', message: undefined })
      try {
        const body = new FormData()
        body.set('file', item.file)
        body.set('requisitionId', requisitionId)
        const res = await fetch('/api/upload', { method: 'POST', body })
        const json = (await res.json().catch(() => ({}))) as { status?: Status; error?: string }
        if (!res.ok) {
          patch(item.key, { status: res.status === 413 || res.status === 400 ? 'rejected' : 'failed', message: json.error ?? 'Upload failed.' })
        } else {
          patch(item.key, { status: json.status ?? 'scored' })
        }
      } catch {
        patch(item.key, { status: 'failed', message: 'Network error. Retry to continue.' })
      }
    },
    [patch, requisitionId],
  )

  /** Run the given items through a pool of CONCURRENCY workers. */
  const runPool = useCallback(
    async (batch: Item[]) => {
      setRunning(true)
      const queue = [...batch]
      const worker = async () => {
        for (let next = queue.shift(); next; next = queue.shift()) await send(next)
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker))
      setRunning(false)
      router.refresh()
    },
    [router, send],
  )

  function addFiles(list: FileList | File[]) {
    const files = Array.from(list).slice(0, MAX_FILES)
    const next: Item[] = files.map((file, i) => {
      const problem = precheck(file)
      return {
        key: `${Date.now()}-${i}-${file.name}`,
        file,
        status: problem ? 'rejected' : 'queued',
        message: problem ?? undefined,
      }
    })
    setItems(next)
    void runPool(next.filter((i) => i.status === 'queued'))
  }

  const retryFailed = () => {
    const failed = items.filter((i) => i.status === 'failed')
    void runPool(failed)
  }

  const done = items.filter((i) => !['queued', 'uploading'].includes(i.status)).length
  const failedCount = items.filter((i) => i.status === 'failed').length

  return (
    <section aria-label="Upload CVs" className="mb-8">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          if (!running) addFiles(e.dataTransfer.files)
        }}
        className={`flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-dashed px-6 py-8 text-center ${
          over ? 'border-[var(--color-accent)] bg-[var(--color-surface)]' : 'border-[var(--color-border)]'
        }`}
      >
        <p className="font-medium">Drop CVs here, or choose files</p>
        <p className="text-sm text-[var(--color-muted)]">
          PDF or DOCX, up to 4 MB each, up to {MAX_FILES} at a time. Interrupted? Select the same files again; finished ones are skipped.
        </p>
        <input ref={inputRef} type="file" multiple accept={ACCEPT} hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
        <Button variant="outline" disabled={running} onClick={() => inputRef.current?.click()}>
          Choose files
        </Button>
      </div>

      {items.length > 0 && (
        <div className="mt-4" aria-live="polite">
          <div className="mb-2 flex items-center justify-between gap-4 text-sm">
            <span>
              {done} of {items.length} processed
            </span>
            {failedCount > 0 && !running && (
              <Button size="sm" variant="outline" onClick={retryFailed}>
                Retry {failedCount} failed
              </Button>
            )}
          </div>
          <ul className="max-h-64 divide-y divide-[var(--color-border)] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            {items.map((i) => (
              <li key={i.key} className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">{i.file.name}</span>
                  {i.message && <span className="block text-xs text-[var(--color-muted)]">{i.message}</span>}
                </span>
                <Badge variant={LABEL[i.status].variant}>{LABEL[i.status].text}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
