import * as React from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-4 py-16 text-center', className)}>
      {icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-border)] text-[var(--color-muted)]">
          {icon}
        </div>
      )}
      <div className="flex flex-col gap-2">
        <p className="font-medium text-[var(--color-ink)]">{title}</p>
        {description && (
          <p className="max-w-sm text-sm text-[var(--color-muted)]">{description}</p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
