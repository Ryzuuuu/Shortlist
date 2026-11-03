'use client'

import { PageError } from '@/components/page-error'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <PageError reset={reset} />
}
