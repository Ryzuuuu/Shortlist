/**
 * src/lib/session.ts
 *
 * Server-only session guards for Server Components and Server Actions.
 * Server Actions are reachable by direct POST, so every action calls one of
 * these rather than trusting the page that rendered it.
 */
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getSession, toPolicyUser } from '@/lib/auth'

/** A client hiring manager bound to a client organisation. Staff go to their own area. */
export async function requireClient() {
  const session = await getSession(await headers())
  const user = toPolicyUser(session?.user)
  if (!session || !user) redirect('/login')
  if (user.role !== 'client') redirect('/recruiter')
  if (!user.clientId) redirect('/login')
  return { session, user: { ...user, clientId: user.clientId } }
}

/** Recruiter or delivery head. Clients are sent to their portal; anonymous to login. */
export async function requireStaff() {
  const session = await getSession(await headers())
  const user = toPolicyUser(session?.user)
  if (!session || !user) redirect('/login')
  if (user.role === 'client') redirect('/portal')
  return { session, user }
}
