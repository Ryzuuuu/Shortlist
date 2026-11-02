import { auth } from '@/lib/auth'

/**
 * Better Auth catch-all route handler.
 * Handles all /api/auth/* requests (sign-in, sign-up, sign-out, session, etc.)
 */
export async function GET(request: Request): Promise<Response> {
  return auth.handler(request)
}

export async function POST(request: Request): Promise<Response> {
  return auth.handler(request)
}
