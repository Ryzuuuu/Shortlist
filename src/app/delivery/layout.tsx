import { Suspense } from 'react'
import Link from 'next/link'
import { requireStaff } from '@/lib/session'
import { SignOutButton } from '@/components/sign-out-button'

/** Static shell; the user streams in behind Suspense. Pages enforce access themselves. */
export default function DeliveryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-2 py-2 sm:px-3">
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/delivery" className="font-serif text-xl">
              Shortlist
            </Link>
            <Link href="/delivery" className="text-[var(--color-muted)] hover:text-[var(--color-ink)]">
              AI vs recruiters
            </Link>
            <Link href="/recruiter" className="text-[var(--color-muted)] hover:text-[var(--color-ink)]">
              Requisitions
            </Link>
            <Link href="/delivery/audit" className="text-[var(--color-muted)] hover:text-[var(--color-ink)]">
              Audit log
            </Link>
          </nav>
          <Suspense fallback={<span className="h-8" aria-hidden />}>
            <UserBar />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-2 py-3 sm:px-3 sm:py-4">{children}</main>
    </div>
  )
}

async function UserBar() {
  const { session } = await requireStaff()
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="hidden text-[var(--color-muted)] sm:inline">{session.user.email}</span>
      <SignOutButton />
    </div>
  )
}
