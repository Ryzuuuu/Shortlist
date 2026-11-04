import Link from 'next/link'

const TABS = [
  { key: 'ranked', label: 'Ranked list', href: (id: string) => `/recruiter/requisitions/${id}` },
  { key: 'pipeline', label: 'Pipeline', href: (id: string) => `/recruiter/requisitions/${id}/pipeline` },
] as const

/** Switches between the two views of one requisition. */
export function RequisitionTabs({ id, active }: { id: string; active: 'ranked' | 'pipeline' }) {
  return (
    <nav aria-label="Requisition views" className="mb-6 flex gap-6 border-b border-[var(--color-border)]">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href(id)}
          aria-current={t.key === active ? 'page' : undefined}
          className={`-mb-px border-b-2 pb-2 text-sm ${
            t.key === active ? 'border-[var(--color-accent)] font-medium' : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-ink)]'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
