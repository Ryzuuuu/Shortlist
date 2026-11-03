import { Suspense } from 'react'
import { LoginForm } from './login-form'

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-6">
      <h1 className="text-3xl">Shortlist</h1>
      <p className="mt-1 mb-4 text-[var(--color-muted)]">Sign in to review candidates.</p>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  )
}
