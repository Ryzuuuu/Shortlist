import type { Config } from 'drizzle-kit'

// drizzle-kit does not read .env.local on its own. Load it when present so `npm run db:migrate`
// works after copying .env.example; a DATABASE_URL already in the environment (CI, deploys) wins.
try {
  process.loadEnvFile('.env.local')
} catch {
  // no .env.local: rely on the environment
}

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
} satisfies Config
