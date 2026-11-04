import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="flex flex-col gap-2">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-[var(--color-ink)]"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            // 16px text on phones: iOS Safari zooms the page when a smaller field is focused. 44px tap target.
            'h-10 max-sm:h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-base sm:text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)] transition-colors focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] disabled:opacity-40',
            error && 'border-[var(--color-error)] focus:ring-[var(--color-error)]',
            className,
          )}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...props}
        />
        {hint && !error && (
          <p id={`${inputId}-hint`} className="text-xs text-[var(--color-muted)]">{hint}</p>
        )}
        {error && (
          <p id={`${inputId}-error`} role="alert" className="text-xs text-[var(--color-error)]">{error}</p>
        )}
      </div>
    )
  },
)
Input.displayName = 'Input'
