/**
 * A file still "parsing" or "pending" after this long was abandoned (the request
 * timed out or the server restarted). It is shown under "Needs your attention"
 * and may be retried, so nothing stays stuck and unseen (AI rule 5).
 */
export const STALE_PROCESSING_MS = 3 * 60 * 1000

export function isStaleProcessing(status: string, updatedAt: Date, now = Date.now()): boolean {
  return (status === 'parsing' || status === 'pending') && now - updatedAt.getTime() > STALE_PROCESSING_MS
}
