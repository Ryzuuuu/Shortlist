import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

/**
 * Neon serverless HTTP client.
 * DATABASE_URL must be set at runtime (never committed).
 */
function getDb() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL environment variable is not set')
  }
  const sql = neon(url)
  return drizzle(sql, { schema })
}

// Singleton for serverless — recreated per cold start (Neon HTTP is stateless)
export const db = getDb()

export type DB = typeof db
