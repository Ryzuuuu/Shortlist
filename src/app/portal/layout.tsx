import { Suspense } from 'react'
import Link from 'next/link'
import { requireClient } from '@/lib/session'
import { SignOutButton } from '@/components/sign-out-button'

/**
 * Static shell; the signed-in user streams in behind Suspense. Authorisation is
 * done by each page and Server Action via requireClient(), not by this layout.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-2 py-2">
          <Link href="/portal" className="font-serif text-xl">
            Shortlist
          </Link>
          <Suspense fallback={<span className="h-8" aria-hidden />}>
            <ClientBar />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-2 py-3">{children}</main>
    </div>
  )
}

async function ClientBar() {
  await requireClient()
  return <SignOutButton />
}
