'use client'

import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui'

export function SignOutButton() {
  const router = useRouter()
  return (
    <Button
      variant="ghost"
      size="sm"
      className="max-sm:min-h-11"
      onClick={async () => {
        await authClient.signOut()
        router.replace('/login')
        router.refresh()
      }}
    >
      Sign out
    </Button>
  )
}
