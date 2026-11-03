import Link from 'next/link'
import { requireStaff } from '@/lib/session'
import { SignOutButton } from './sign-out-button'

export default async function RecruiterLayout({ children }: { children: React.ReactNode }) {
  const { session } = await requireStaff()
  return (
    <div className="min-h-dvh">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-2 py-2 sm:px-3">
          <Link href="/recruiter" className="font-serif text-xl">
            Shortlist
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden text-[var(--color-muted)] sm:inline">{session.user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-2 py-3 sm:px-3 sm:py-4">{children}</main>
    </div>
  )
}
