'use client'

import { Button } from '@/components/ui'

/** Shared body for route-level error.tsx files. */
export function PageError({ reset, message }: { reset: () => void; message?: string }) {
  return (
    <div role="alert" className="mx-auto max-w-md py-6 text-center">
      <h2 className="text-2xl">Something went wrong</h2>
      <p className="mt-1 mb-3 text-[var(--color-muted)]">{message ?? 'This page could not be loaded. Try again.'}</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
