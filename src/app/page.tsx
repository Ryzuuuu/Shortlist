import { Suspense } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getSession, toPolicyUser } from '@/lib/auth'

/** Entry point: send each role to its own home. */
export default function Home() {
  return (
    <Suspense fallback={null}>
      <RoleRedirect />
    </Suspense>
  )
}

async function RoleRedirect() {
  const user = toPolicyUser((await getSession(await headers()))?.user)
  if (!user) redirect('/login')
  const home = { client: '/portal', delivery_head: '/delivery', recruiter: '/recruiter' }[user.role]
  return redirect(home)
}
