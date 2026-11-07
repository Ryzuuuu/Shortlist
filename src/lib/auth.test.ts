import { describe, expect, it, vi } from 'vitest'

// auth.ts builds a Drizzle adapter at import time; sign-up is refused before any query runs.
vi.mock('@/db', () => ({ db: {} }))

describe('authentication hardening', () => {
  // The first import of the auth library is slow when many test files run at once; the default 5 s is too tight.
  it('refuses self-registration, so nobody can create a default recruiter account', { timeout: 30_000 }, async () => {
    process.env.BETTER_AUTH_SECRET = 'test-secret-test-secret-test-secret-123'
    const { auth } = await import('./auth')
    expect(auth.options.emailAndPassword?.disableSignUp).toBe(true)
    await expect(
      auth.api.signUpEmail({ body: { email: 'intruder@example.com', password: 'Passw0rd!Passw0rd!', name: 'Intruder' } }),
    ).rejects.toThrow(/sign up is not enabled/i)
  })

  it('never lets the client set role or clientId', async () => {
    const { auth } = await import('./auth')
    const fields = auth.options.user?.additionalFields as Record<string, { input?: boolean }>
    expect(fields.role?.input).toBe(false)
    expect(fields.clientId?.input).toBe(false)
  })

  it('seed password hashes verify with the same library sign-in uses', async () => {
    const { hashPassword, verifyPassword } = await import('better-auth/crypto')
    const hash = await hashPassword('demo-password-123')
    expect(await verifyPassword({ hash, password: 'demo-password-123' })).toBe(true)
    expect(await verifyPassword({ hash, password: 'wrong' })).toBe(false)
  })
})
