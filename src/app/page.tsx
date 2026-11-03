import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getSession, toPolicyUser } from '@/lib/auth'

/** Entry point: send each role to its own home. */
export default async function Home() {
  const user = toPolicyUser((await getSession(await headers()))?.user)
  if (!user) redirect('/login')
  redirect(user.role === 'client' ? '/portal' : '/recruiter')
}
