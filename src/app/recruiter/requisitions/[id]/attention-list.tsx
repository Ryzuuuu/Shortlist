'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge, Button } from '@/components/ui'

interface FileRow {
  id: string
  filename: string
  status: 'failed' | 'needs_review' | string
  message: string | null
}

/** CVs that need a person: parse failures, scans without a vision provider, low confidence. */
export function AttentionList({ files }: { files: FileRow[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function retry(id: string) {
    setBusy(id)
    setError(null)
    try {
      const res = await fetch('/api/upload/retry', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fileId: id }),
      })
      if (!res.ok) setError('Retry failed. Please try again.')
    } catch {
      setError('Network error. Please try again.')
    }
    setBusy(null)
    router.refresh()
  }

  return (
    <section aria-label="Needs attention" className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <h2 className="border-b border-[var(--color-border)] px-2 py-1 font-sans text-sm font-medium">
        Needs your attention ({files.length})
      </h2>
      <ul className="divide-y divide-[var(--color-border)]">
        {files.map((f) => (
          <li key={f.id} className="flex items-center justify-between gap-2 px-2 py-1 text-sm">
            <span className="min-w-0">
              <span className="block truncate">{f.filename}</span>
              {f.message && <span className="block text-xs text-[var(--color-muted)]">{f.message}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <Badge variant={f.status === 'failed' ? 'error' : 'warning'}>{f.status === 'failed' ? 'Failed' : 'Needs review'}</Badge>
              <Button size="sm" variant="outline" disabled={busy === f.id} onClick={() => retry(f.id)}>
                {busy === f.id ? 'Retrying…' : 'Retry'}
              </Button>
            </span>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="px-2 py-1 text-sm text-[var(--color-error)]">
          {error}
        </p>
      )}
    </section>
  )
}
