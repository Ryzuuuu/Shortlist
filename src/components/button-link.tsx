import Link from 'next/link'
import type { VariantProps } from 'class-variance-authority'
import { buttonVariants } from '@/components/ui'
import { cn } from '@/lib/utils'

type Props = React.ComponentProps<typeof Link> & VariantProps<typeof buttonVariants>

/** A real anchor styled as a button, so navigation is never a button nested in a link. */
export function ButtonLink({ variant, size, className, ...props }: Props) {
  return <Link className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
