'use client'

import { filterLabel, type JdFilter } from '@shortlist/core'
import { Button, Input } from '@/components/ui'

type FilterType = JdFilter['type']

const IDS: Record<FilterType, string> = {
  years_experience_range: 'f-exp',
  max_notice_days: 'f-notice',
  ctc_range_lpa: 'f-ctc',
  location: 'f-loc',
}

const TITLES: Record<FilterType, string> = {
  years_experience_range: 'Experience',
  max_notice_days: 'Notice period',
  ctc_range_lpa: 'CTC budget',
  location: 'Location',
}

const DEFAULTS: Record<FilterType, unknown> = {
  years_experience_range: { min: 0, max: null },
  max_notice_days: 60,
  ctc_range_lpa: { min: 0, max: 0 },
  location: '',
}

type Range = { min: number; max: number | null }

/** Reads an input: empty means "none" (null) when allowed, otherwise zero. */
function read(raw: string, allowNull: boolean): number | null {
  if (raw.trim() === '') return allowNull ? null : 0
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : allowNull ? null : 0
}

interface Props {
  filters: JdFilter[]
  onChange: (filters: JdFilter[]) => void
}

/**
 * The limits read from the JD (experience, notice, CTC, location) as editable fields. They label each
 * candidate on the ranked list; they never remove anyone. The server validates and relabels them on save.
 */
export function FilterEditor({ filters, onChange }: Props) {
  const set = (type: FilterType, value: unknown) =>
    onChange(filters.map((f) => (f.type === type ? { ...f, value, label: filterLabel(type, value) } : f)))
  const remove = (type: FilterType) => onChange(filters.filter((f) => f.type !== type))
  const missing = (Object.keys(IDS) as FilterType[]).filter((t) => !filters.some((f) => f.type === t))

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-2 text-sm font-medium">Limits read from the JD</legend>
      <p className="text-sm text-[var(--color-muted)]">
        These label each candidate as meets, misses or not stated. They never change a score or hide anyone. Edit or remove any of them.
      </p>

      {filters.length === 0 && <p className="text-sm text-[var(--color-muted)]">None found in the JD. Add one below if you want it checked.</p>}

      <ul className="flex flex-col gap-4">
        {filters.map((f) => {
          const range = f.value as Range
          return (
            <li key={f.id} className="flex flex-wrap items-end gap-4">
              <span className="w-28 text-sm">{TITLES[f.type]}</span>

              {f.type === 'years_experience_range' && (
                <>
                  <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
                    From (years)
                    <Input
                      aria-label="Experience from, years"
                      type="number"
                      min={0}
                      max={60}
                      step="0.5"
                      className="w-24"
                      value={range.min}
                      onChange={(e) => set(f.type, { min: read(e.target.value, false) ?? 0, max: range.max })}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
                    To (blank = no limit)
                    <Input
                      aria-label="Experience up to, years"
                      type="number"
                      min={0}
                      max={60}
                      step="0.5"
                      className="w-24"
                      value={range.max ?? ''}
                      onChange={(e) => set(f.type, { min: range.min, max: read(e.target.value, true) })}
                    />
                  </label>
                </>
              )}

              {f.type === 'max_notice_days' && (
                <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
                  Up to (days)
                  <Input
                    aria-label="Notice period up to, days"
                    type="number"
                    min={0}
                    max={365}
                    className="w-24"
                    value={f.value as number}
                    onChange={(e) => set(f.type, read(e.target.value, false) ?? 0)}
                  />
                </label>
              )}

              {f.type === 'ctc_range_lpa' && (
                <>
                  <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
                    From (LPA)
                    <Input
                      aria-label="CTC from, LPA"
                      type="number"
                      min={0}
                      className="w-24"
                      value={range.min}
                      onChange={(e) => set(f.type, { min: read(e.target.value, false) ?? 0, max: range.max ?? 0 })}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
                    To (LPA)
                    <Input
                      aria-label="CTC up to, LPA"
                      type="number"
                      min={0}
                      className="w-24"
                      value={range.max ?? 0}
                      onChange={(e) => set(f.type, { min: range.min, max: read(e.target.value, false) ?? 0 })}
                    />
                  </label>
                </>
              )}

              {f.type === 'location' && (
                <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
                  City
                  <Input aria-label="Location" className="w-48" value={f.value as string} onChange={(e) => set(f.type, e.target.value)} />
                </label>
              )}

              <Button variant="ghost" size="sm" onClick={() => remove(f.type)} aria-label={`Remove ${TITLES[f.type]} filter`}>
                Remove
              </Button>
            </li>
          )
        })}
      </ul>

      {missing.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[var(--color-muted)]">Add:</span>
          {missing.map((t) => (
            <Button
              key={t}
              variant="outline"
              size="sm"
              onClick={() => onChange([...filters, { id: IDS[t], type: t, value: DEFAULTS[t], label: filterLabel(t, DEFAULTS[t]) }])}
            >
              {TITLES[t]}
            </Button>
          ))}
        </div>
      )}
    </fieldset>
  )
}
