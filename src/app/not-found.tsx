import { ButtonLink } from '@/components/button-link'

/**
 * Shown for any missing page and for pages the visitor may not see. The wording is
 * the same for both on purpose, so it never confirms that a restricted page exists.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 py-6 text-center">
      <h1 className="text-3xl">Page not found</h1>
      <p className="text-[var(--color-muted)]">This page does not exist, or you do not have access to it.</p>
      <ButtonLink href="/">Go to your home page</ButtonLink>
    </main>
  )
}
