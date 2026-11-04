# Deployment

Target: Vercel (app) + Neon (Postgres) + Vercel Blob (CV files). `vercel.json` pins the region to `bom1` (Mumbai) for users in India; put the Neon project in a nearby region (AWS Asia Pacific, Mumbai or Singapore).

> Status: **deployed** at https://shortlist-six-flax.vercel.app (Vercel project `shortlist`, region `bom1`, Neon project `shortlist` in Singapore, private Vercel Blob store `shortlist-cvs`). `npm run smoke` against that address passes (40 checks: sign-in for all three roles, security headers, cookie flags, access control, client isolation with a control, the new screens, and a real upload): sign-in for all three roles, wrong-password and self-sign-up refusal, role checks on the upload and CSV APIs, one client's page containing none of another client's candidates (with a control showing the test can detect a leak), a real PDF upload stored in Blob, parsed and scored, and a repeat upload recognised as a duplicate. Not yet checked: the phone layout, and a browser pass over each screen.

> Access: the main address `shortlist-six-flax.vercel.app` is public (the app's own sign-in protects the data). Vercel's per-deployment URLs (`shortlist-<hash>-...vercel.app`) stay behind Vercel Authentication.

> Known behaviour: a client opening another client's requisition gets an HTTP **200** page that says "not found", not a 404 status, because the page streams (Cache Components) and the status line is sent before the access check finishes. No data is included in that response. The same applies to a client opening a staff page: the response is HTTP 200 containing a redirect to `/portal` and none of the staff content (checked by `npm run smoke`). A strict 404 or 302 would need the check to run before streaming starts.

## 1. Services

1. **Neon.** Create a project and copy the pooled connection string. Use one database per environment (production, preview).
2. **Vercel Blob.** In the Vercel project, Storage, create a Blob store. This adds `BLOB_READ_WRITE_TOKEN` to the project. CV files are stored with `access: 'private'`.
3. **LLM (optional).** Leave `LLM_PROVIDER=heuristic` to run with no key. For real scoring set `LLM_PROVIDER=anthropic` with `ANTHROPIC_API_KEY`, or `gemini` with `GEMINI_API_KEY`. A vision-capable key is also what lets scanned PDFs be read.

## 2. Environment variables

| Name | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon connection string |
| `BETTER_AUTH_SECRET` | yes | 32+ random characters, different per environment. Never commit it |
| `BETTER_AUTH_URL` | recommended | The deployed origin. If unset on Vercel it falls back to the platform's `VERCEL_PROJECT_PRODUCTION_URL` |
| `NEXT_PUBLIC_APP_URL` | no | Same origin. If unset, the browser auth client uses the page's own origin |
| `BLOB_READ_WRITE_TOKEN` | yes on Vercel | Without it uploads fail with a clear error (the local-disk fallback is refused on Vercel) |
| `LLM_PROVIDER` | no | `heuristic` (default), `anthropic`, `gemini` |
| `ANTHROPIC_MODEL` / `GEMINI_MODEL` | no | Override the model (defaults `claude-opus-5-5` and `gemini-2.5-flash`); a cheaper model suits bulk screening. The Gemini default is not verified against the live API |
| `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` | only for that provider | A missing key falls back to `heuristic` |
| `AUDIT_HASH_KEY` | recommended | Keys the anonymised ID kept after a deletion. Falls back to `BETTER_AUTH_SECRET`. Do not rotate it after deletions have happened or earlier stubs stop matching |
| `SEED_PASSWORD` | seeding only | Password for the demo accounts. Required, 12+ characters, no default |

Set these in Vercel, Project Settings, Environment Variables (mark secrets as Sensitive; they then cannot be read back). `.env*` files are git-ignored (only `.env.example`, which holds no secrets, is tracked).

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

## 4b. Maintenance commands

After changing the scorer, the extractor or the LLM provider, refresh stored data so the app and new uploads agree:

```bash
npm run db:reextract   # re-derive profiles and de-duplication keys from the stored CV text (idempotent)
npm run db:rescore     # re-score every candidate (free with the heuristic provider; one model call each otherwise)
```

## 5. Deploy

1. Import the GitHub repository in Vercel (Next.js is detected; no custom build command).
2. Add the environment variables above, then deploy.
3. Install: a committed `.npmrc` sets `legacy-peer-deps` (a vitest / `@types/node` peer conflict makes a plain `npm install` fail with ERESOLVE otherwise), so Vercel's default install works with no custom command.
4. The build needs no secrets: the database client is created on first use, not at import. Secrets are only needed at runtime.
5. PDF parsing uses pdf.js, which needs the native `@napi-rs/canvas` package for `DOMMatrix`. Left bundled, that binary is not packaged into the serverless function and every PDF fails with "Cannot polyfill DOMMatrix". `next.config.ts` therefore marks `pdf-parse`, `pdfjs-dist` and `@napi-rs/canvas` as external and force-includes their files (and the Linux x64 binary) for `/api/upload` and `/api/upload/retry`. If you change platforms or add another route that parses CVs, add it to `outputFileTracingIncludes`.
6. Upload routes set `maxDuration = 60`. Each request handles one CV; very slow LLM calls on a Hobby plan may hit the plan's lower function limit.

## 6. Security notes

- Roles come only from the database; the client cannot set `role` or `clientId`. Sign-up is off (`disableSignUp`), and a test pins this.
- Every route handler and server action calls `can()`; client queries are also scoped by `clientId` in SQL.
- Security headers are set in `next.config.ts` (`nosniff`, frame denial, referrer and permissions policies). A strict Content-Security-Policy is not set; it needs per-request nonces for Next's inline scripts and is a follow-up.
- CVs and the LLM cache hold personal data. Deletion on request removes files, profile and cached AI output, and keeps only a keyed-hash audit stub.
- Sign-in is rate limited by Better Auth's defaults (a burst of sign-ins from one address returns HTTP 429, observed in testing). The upload endpoint has no limiter of its own; add Vercel's WAF or an application limiter before real use.
- Text is redacted of name, gender, age/DOB, photo and marital status before it is sent to an LLM provider. This is best-effort regex redaction, not a trained model; email and phone numbers are also removed.

## 7. Verify after a deploy

Already covered by the scripted smoke test (see Status): items 1, 2 (with a new file), 4's gate, 6, 7 and 8 below. Still worth doing by hand:

1. Sign in as the seeded recruiter; confirm the requisition list loads.
2. Upload a CV that is not already in the requisition (the seeded files in `seed/cvs/` are recognised as duplicates and skipped); confirm it is scored and ranked. This exercises Blob, parsing and scoring.
3. Upload `broken_cv_corrupt.pdf` and `scanned_cv_no_text_layer.pdf` to a new requisition; confirm each appears under "Needs your attention" with Retry.
4. Open a candidate; confirm Submit enables after the CV opens, then submit.
5. Sign in as `client.meridian@shortlist.test` **on a phone**; confirm only submitted candidates appear and contacts are masked until you shortlist.
6. Confirm the other client's account cannot see Meridian's role.
7. As the delivery head, open the dashboard and audit log, and download the CSV.
8. Try `POST /api/auth/sign-up/email`; it must be refused.
9. On a candidate you are happy to lose, use "Delete candidate data" and confirm the Blob file is removed as well as the profile.
