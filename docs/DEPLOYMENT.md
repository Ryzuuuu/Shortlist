# Deployment

Target: Vercel (app) + Neon (Postgres) + Vercel Blob (CV files). `vercel.json` pins the region to `bom1` (Mumbai) for users in India; put the Neon project in a nearby region (AWS Asia Pacific, Mumbai or Singapore).

> Status: the app builds (`next build`) and all checks pass locally. It has **not** yet been deployed or run end to end against a live database or Blob store, so work through the verification list at the bottom after the first deploy.

## 1. Services

1. **Neon.** Create a project and copy the pooled connection string. Use one database per environment (production, preview).
2. **Vercel Blob.** In the Vercel project, Storage, create a Blob store. This adds `BLOB_READ_WRITE_TOKEN` to the project. CV files are stored with `access: 'private'`.
3. **LLM (optional).** Leave `LLM_PROVIDER=heuristic` to run with no key. For real scoring set `LLM_PROVIDER=anthropic` with `ANTHROPIC_API_KEY`, or `gemini` with `GEMINI_API_KEY`. A vision-capable key is also what lets scanned PDFs be read.

## 2. Environment variables

| Name | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon connection string |
| `BETTER_AUTH_SECRET` | yes | 32+ random characters, different per environment. Never commit it |
| `BETTER_AUTH_URL` | yes | The deployed origin, e.g. `https://your-app.vercel.app` |
| `NEXT_PUBLIC_APP_URL` | yes | Same origin; used by the browser auth client |
| `BLOB_READ_WRITE_TOKEN` | yes on Vercel | Without it uploads fail with a clear error (the local-disk fallback is refused on Vercel) |
| `LLM_PROVIDER` | no | `heuristic` (default), `anthropic`, `gemini` |
| `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` | only for that provider | A missing key falls back to `heuristic` |
| `AUDIT_HASH_KEY` | recommended | Keys the anonymised ID kept after a deletion. Falls back to `BETTER_AUTH_SECRET`. Do not rotate it after deletions have happened or earlier stubs stop matching |
| `SEED_PASSWORD` | seeding only | Password for the demo accounts |

Set these in Vercel, Project Settings, Environment Variables. `.env*` files are git-ignored (only `.env.example`, which holds no secrets, is tracked).

## 3. Database

Run migrations from your machine (or CI) against the target database:

```bash
DATABASE_URL="<neon url>" npm run db:migrate
```

Migrations are not run automatically at build time, so a deploy can never alter the schema by surprise.

## 4. Accounts

Self-sign-up is disabled, so no one can create an account through the site. Accounts are created by the seed script, which writes users with their role directly.

- **Demo or staging:** `DATABASE_URL="<url>" SEED_PASSWORD="<strong password>" npm run db:seed` loads demo accounts and 44 synthetic CVs. The script refuses to run with `NODE_ENV=production`.
- **Real use:** do not seed the production database. Create the first delivery head and recruiters directly in SQL or with a small admin script (a user row with `role`, plus a credential `accounts` row holding a hash from `better-auth/crypto`'s `hashPassword`). An in-app admin screen is not built.

## 5. Deploy

1. Import the GitHub repository in Vercel (Next.js is detected; no custom build command).
2. Add the environment variables above, then deploy.
3. Install: a committed `.npmrc` sets `legacy-peer-deps` (a vitest / `@types/node` peer conflict makes a plain `npm install` fail with ERESOLVE otherwise), so Vercel's default install works with no custom command.
4. Upload routes set `maxDuration = 60`. Each request handles one CV; very slow LLM calls on a Hobby plan may hit the plan's lower function limit.

## 6. Security notes

- Roles come only from the database; the client cannot set `role` or `clientId`. Sign-up is off (`disableSignUp`), and a test pins this.
- Every route handler and server action calls `can()`; client queries are also scoped by `clientId` in SQL.
- Security headers are set in `next.config.ts` (`nosniff`, frame denial, referrer and permissions policies). A strict Content-Security-Policy is not set; it needs per-request nonces for Next's inline scripts and is a follow-up.
- CVs and the LLM cache hold personal data. Deletion on request removes files, profile and cached AI output, and keeps only a keyed-hash audit stub.
- There is no rate limiting on sign-in or upload. Add Vercel's WAF or an application limiter before real use.
- Text is redacted of name, gender, age/DOB, photo and marital status before it is sent to an LLM provider. This is best-effort regex redaction, not a trained model; email and phone numbers are also removed.

## 7. Verify after the first deploy

1. Sign in as the seeded recruiter; confirm the requisition list loads.
2. Upload `seed/cvs/01_Ritika_Bansal.pdf`; confirm it is scored and ranked (this exercises Blob, parsing and scoring).
3. Upload `broken_cv_corrupt.pdf` and `scanned_cv_no_text_layer.pdf`; confirm each appears under "Needs your attention" with Retry.
4. Open a candidate; confirm Submit enables after the CV opens, then submit.
5. Sign in as `client.meridian@shortlist.test` on a phone; confirm only submitted candidates appear and contacts are masked until you shortlist.
6. Confirm the other client's account cannot see Meridian's role.
7. As the delivery head, open the dashboard and audit log, and download the CSV.
8. Try `POST /api/auth/sign-up/email`; it must be refused.
