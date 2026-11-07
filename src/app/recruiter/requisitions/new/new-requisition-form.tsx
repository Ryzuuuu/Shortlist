'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@/components/ui'
import { FilterEditor } from './filter-editor'
import { createRequisition, suggestScorecard, type DraftScorecard } from '../actions'

type Criterion = DraftScorecard['criteria'][number]

const fieldClass =
  'w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm'

export function NewRequisitionForm({ clients }: { clients: Array<{ id: string; name: string }> }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [title, setTitle] = useState('')
  const [clientId, setClientId] = useState(clients[0]?.id ?? '')
  const [jd, setJd] = useState('')
  const [draft, setDraft] = useState<DraftScorecard | null>(null)
  const [error, setError] = useState<string | null>(null)

  const update = (id: string, patch: Partial<Criterion>) =>
    setDraft((d) => d && { ...d, criteria: d.criteria.map((c) => (c.id === id ? { ...c, ...patch } : c)) })

  function extract() {
    setError(null)
    startTransition(async () => {
      const res = await suggestScorecard(jd)
      if (res.ok) setDraft(res.data)
      else setError(res.error)
    })
  }

  function create() {
    if (!draft) return
    setError(null)
    startTransition(async () => {
      const res = await createRequisition({ title, clientId, jdText: jd, criteria: draft.criteria, filters: draft.filters })
      if (res.ok) router.push(`/recruiter/requisitions/${res.data.id}`)
      else setError(res.error)
    })
  }

  const totalWeight = draft?.criteria.reduce((s, c) => s + c.weight, 0) ?? 0

  if (clients.length === 0) {
    return <p className="text-[var(--color-muted)]">Add a client before creating a requisition.</p>
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm">
          Title
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Senior Java Developer (Noida)" />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          Client
          <select className={fieldClass} value={clientId} onChange={(e) => setClientId(e.target.value)}>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-2 text-sm">
        Job description
        <textarea className={`${fieldClass} min-h-40`} value={jd} onChange={(e) => setJd(e.target.value)} />
      </label>

      {!draft && (
        <div>
          <Button onClick={extract} disabled={pending || jd.trim().length < 20}>
            {pending ? 'Extracting…' : 'Extract scorecard'}
          </Button>
        </div>
      )}

      {draft && (
        <Card>
          <CardHeader>
            <CardTitle>Scorecard</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <p className="text-sm text-[var(--color-muted)]">
              Each criterion has a name, what to look for in a CV, a weight, and whether it is a must-have. Edit anything before saving; nothing is scored until you do.
            </p>
            <FilterEditor filters={draft.filters} onChange={(filters) => setDraft({ ...draft, filters })} />

            <ul className="flex flex-col gap-4">
              {draft.criteria.map((c) => (
                <li key={c.id} className="grid gap-2 border-b border-[var(--color-border)] pb-4 sm:grid-cols-[1fr_96px_auto_auto] sm:items-center">
                  <div className="flex flex-col gap-2">
                    <Input aria-label="Criterion name" value={c.label} onChange={(e) => update(c.id, { label: e.target.value })} />
                    <Input aria-label="What to look for" value={c.description} onChange={(e) => update(c.id, { description: e.target.value })} />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Input
                      aria-label="Weight percent"
                      type="number"
                      min={0}
                      max={100}
                      value={c.weight}
                      onChange={(e) => update(c.id, { weight: Number(e.target.value) })}
                    />
                    %
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={c.mustHave} onChange={(e) => update(c.id, { mustHave: e.target.checked })} />
                    Must have
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDraft({ ...draft, criteria: draft.criteria.filter((x) => x.id !== c.id) })}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setDraft({
                    ...draft,
                    criteria: [...draft.criteria, { id: crypto.randomUUID(), label: '', description: '', weight: 0, mustHave: false }],
                  })
                }
              >
                Add criterion
              </Button>
              <span className="text-sm text-[var(--color-muted)]">
                Weights total {totalWeight}% (rescaled to 100% on save)
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {error}
        </p>
      )}

      {draft && (
        <div className="flex gap-4">
          <Button onClick={create} disabled={pending || title.trim().length < 2}>
            {pending ? 'Creating…' : 'Create requisition'}
          </Button>
          <Button variant="ghost" onClick={() => setDraft(null)} disabled={pending}>
            Back to job description
          </Button>
        </div>
      )}
    </div>
  )
}
