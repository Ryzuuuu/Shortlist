import { Skeleton } from '@/components/ui'

export default function Loading() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading requisition">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  )
}
