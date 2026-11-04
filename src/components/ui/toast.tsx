'use client'
import * as React from 'react'
import { cn } from '@/lib/utils'

export type ToastVariant = 'default' | 'success' | 'error' | 'warning'

interface ToastProps {
  message: string
  variant?: ToastVariant
  onDismiss?: () => void
}

const variantStyles: Record<ToastVariant, string> = {
  default: 'bg-[var(--color-ink)] text-white',
  success: 'bg-green-700 text-white',
  error: 'bg-[var(--color-error)] text-white',
  warning: 'bg-amber-600 text-white',
}

export function Toast({ message, variant = 'default', onDismiss }: ToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center justify-between gap-4 rounded-[var(--radius-md)] px-4 py-4 text-sm shadow-[var(--shadow-md)]',
        variantStyles[variant],
      )}
    >
      <span>{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="ml-2 opacity-70 hover:opacity-100"
        >
          ✕
        </button>
      )}
    </div>
  )
}

interface ToastContainerProps {
  toasts: Array<{ id: string; message: string; variant?: ToastVariant }>
  onDismiss: (id: string) => void
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
    >
      {toasts.map((t) => (
        <Toast key={t.id} message={t.message} variant={t.variant} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  )
}
