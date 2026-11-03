'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { Button, Input } from '@/components/ui'

export function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setPending(true)
    const form = new FormData(e.currentTarget)
    const { error } = await authClient.signIn.email({
      email: String(form.get('email')),
      password: String(form.get('password')),
    })
    setPending(false)
    if (error) {
      setError('Incorrect email or password.')
      return
    }
    // "/" routes each role to its own home.
    const from = params.get('from')
    router.replace(from && from.startsWith('/') && !from.startsWith('//') ? from : '/')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2" noValidate>
      <label className="flex flex-col gap-1 text-sm">
        Email
        <Input name="email" type="email" autoComplete="email" required />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Password
        <Input name="password" type="password" autoComplete="current-password" required />
      </label>
      {error && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  )
}
