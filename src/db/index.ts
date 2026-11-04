import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

function createDb() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL environment variable is not set')
  }
  return drizzle(neon(url), { schema })
}

export type DB = ReturnType<typeof createDb>

let instance: DB | undefined

/**
 * Neon serverless HTTP client, created on first use rather than at import.
 * `next build` imports every route module, and a build must not need production
 * secrets; the "DATABASE_URL is not set" error now surfaces on the first query.
 * DATABASE_URL is never committed.
 */
export const db: DB = new Proxy({} as DB, {
  get(_target, prop) {
    instance ??= createDb()
    const value = Reflect.get(instance, prop, instance)
    return typeof value === 'function' ? value.bind(instance) : value
  },
})
