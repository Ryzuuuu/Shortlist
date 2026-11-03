/**
 * GET /api/delivery/agreement?week=N  — CSV of the weekly AI-rank vs recruiter comparison.
 * week=0 is the current IST week, 1 the previous, and so on. Delivery head only.
 */
import { can, weekBounds } from '@shortlist/core'
import { getSession, toPolicyUser } from '@/lib/auth'
import { getWeeklyAgreement } from '@/lib/queries/agreement'
import { buildAgreementCsv } from '@/lib/reports/agreement-csv'

export async function GET(request: Request) {
  const session = await getSession(request.headers)
  const user = toPolicyUser(session?.user)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!can(user, 'report:export', { type: 'report' })) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const raw = Number.parseInt(new URL(request.url).searchParams.get('week') ?? '0', 10)
  const weeksAgo = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 52) : 0
  const { start, end } = weekBounds(new Date(), weeksAgo)

  const csv = buildAgreementCsv(await getWeeklyAgreement(start, end), start)
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="ai-vs-recruiter-${start.toISOString().slice(0, 10)}.csv"`,
      'cache-control': 'no-store',
    },
  })
}
