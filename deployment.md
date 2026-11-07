# Shortlist: run, deploy, demo logins

- Code: https://github.com/Ryzuuuu/Shortlist
- Live app: https://shortlist-six-flax.vercel.app

This file covers three things: how to run the app on your own machine, how the live copy is deployed (with the names of the environment variables it needs), and how to sign in to the demo. No secret values are in this file or in the repository.

## 1. Demo logins

All three accounts hold synthetic data only (no real people). Sign in at https://shortlist-six-flax.vercel.app/login.

| Role | Email | What it sees |
| --- | --- | --- |
| Recruiter | `recruiter@shortlist.test` | Requisitions, CV upload, ranked list with evidence, CV review, pipeline |
| Client (Meridian Bank Services) | `client.meridian@shortlist.test` | Only the candidates submitted to Meridian, contacts masked until shortlisted. Best viewed on a phone |
| Client (Kestrel Retail) | `client.kestrel@shortlist.test` | Only Kestrel's candidates (Kestrel has none submitted: use it to see that Meridian's candidates are not visible to it) |
| Delivery head | `head@shortlist.test` | Success measures, AI-vs-recruiter agreement, audit log, CSV export |

**Password:** the same for every demo account. It is deliberately not written in this repository (the repository is public). The copy of this file inside the submitted ZIP contains it.

The demo database is shared, so anything you do (submit, shortlist, reject, delete) is visible to the next person. Nothing in it is real.

### A five-minute tour

1. As the recruiter, open **Senior Java Developer (Noida)**. The list is ranked best first; each row shows the criteria met and a quote taken from the CV. Low scorers are labelled "Below fit", never removed.
2. Open a candidate. The CV is on the left; click "Show in CV" beside a piece of evidence and it is highlighted. The Submit button stays disabled until the CV has been opened.
3. Try **New requisition**: paste the job description from the brief (for example "Senior Java Developer, 5-8 years, Spring Boot, Noida, notice up to 60 days"). You get an editable scorecard and the filters it found.
4. Upload files from `seed/cvs/` using the drop zone at the top of the Ranked list (files already uploaded are recognised as duplicates and skipped). Two of the seeded files are a scanned PDF and a corrupt PDF: they show under "Needs your attention" with a Retry button.
5. As the Meridian client (on a phone, or a narrow browser window): open the role, open a candidate, shortlist or reject (a reason is required), and propose an interview time.
6. As the delivery head: open the dashboard (success measures and weekly agreement) and the audit log.

## 2. Run it locally

You need **Node 24** (`node -v`; the project pins `24.x`), npm, and a free **Neon** Postgres database (https://neon.tech). Plain local Postgres does not work: the app talks to Neon over its serverless HTTP driver.

1. Get the code and install:

   ```bash
   git clone https://github.com/Ryzuuuu/Shortlist.git
   cd Shortlist
   npm install
   ```

   A committed `.npmrc` sets `legacy-peer-deps` (a peer-range conflict between vitest and the Node types makes a plain install fail otherwise). `npm ci` also works.

2. Create `.env.local` from the template:

   ```bash
   cp .env.example .env.local
   ```

   Then set three values in it:

   - `DATABASE_URL`: the connection string from your Neon project (Connection details, pooled).
   - `BETTER_AUTH_SECRET`: 32 or more random characters. One way: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   - `SEED_PASSWORD`: the password for the demo accounts (12 or more characters, no default).

   Leave `LLM_PROVIDER=heuristic` to run with no API key. The other variables are optional (section 3).

3. Create the tables, then load the demo data:

   ```bash
   npm run db:migrate
   npm run db:seed
   ```

   The seed creates the four demo accounts, two clients, two requisitions and 44 synthetic CVs, which it pushes through the same parsing, redaction, scoring and duplicate-detection code as a real upload (it includes 2 duplicates, 1 scanned PDF and 1 corrupt file). It refuses to run with `NODE_ENV=production`.

4. Start the app and sign in with the emails in section 1 and the `SEED_PASSWORD` you chose:

   ```bash
   npm run dev
   ```

   Open http://localhost:3000. Uploaded CV files go to a local `.uploads/` folder when no Blob token is set.

5. Optional checks:

   ```bash
   npm run typecheck
   npm run lint
   npm test          # 352 tests
   npm run smoke     # end-to-end checks against a running app; set BASE_URL (default is local) and SEED_PASSWORD
   ```

Other commands: `npm run seed:cvs` regenerates the files in `seed/cvs/`; after changing the scorer or the extractor, `npm run db:reextract` re-derives profiles and duplicate keys from stored CV text and `npm run db:rescore` re-scores every candidate (free with the heuristic provider).

## 3. How it is deployed

| Part | Service | Notes |
| --- | --- | --- |
| App | Vercel, project `shortlist`, region `bom1` (Mumbai) | Next.js 16 on Node 24 (pinned in `package.json`). Every push to `main` on GitHub deploys to production. No custom build command |
| Database | Neon Postgres (Singapore) | Schema migrations are run by hand, never at build time, so a deploy cannot change the schema by surprise |
| CV files | Vercel Blob, private store | Files are stored with private access (no public link to a CV exists) |
| CI | GitHub Actions | Typecheck, lint, tests, dependency audit and a production build on every push |

Steps to reproduce the deployment:

1. Create a Neon project and run `npm run db:migrate` against it from your machine, with its `DATABASE_URL` in `.env.local` or in the environment. For a demo, also run `npm run db:seed`. For real use, do not seed: create the first accounts directly (sign-up is switched off, so there is no public way to create one).
2. In Vercel, import the GitHub repository (Next.js is detected). Add a **Blob** store to the project; this adds `BLOB_READ_WRITE_TOKEN`.
3. Add the environment variables below in Project Settings, Environment Variables. Mark the secrets Sensitive.
4. Deploy. The build needs no secrets: the database client is created on first use, not when the code is loaded.

Environment variables (names only):

| Name | Needed | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon connection string |
| `BETTER_AUTH_SECRET` | yes | Signs sessions. 32+ random characters, different for each environment |
| `BETTER_AUTH_URL` | recommended | The deployed address. If unset on Vercel it falls back to the platform's production URL |
| `NEXT_PUBLIC_APP_URL` | no | The same address, for the browser. If unset the page's own origin is used |
| `BLOB_READ_WRITE_TOKEN` | yes on Vercel | CV file storage. Without it uploads fail with a clear error |
| `LLM_PROVIDER` | no | `heuristic` (default, no key), `anthropic` or `gemini` |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | only for `anthropic` | Key, and an optional model override (default `claude-opus-5-5`) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | only for `gemini` | Key, and an optional model override (default `gemini-3.5-flash`, checked against the live API on 8 Nov 2026; Google retires models, so set `GEMINI_MODEL` if it returns 404) |
| `AUDIT_HASH_KEY` | recommended | Keys the anonymised ID kept in the audit log after a deletion. Falls back to `BETTER_AUTH_SECRET`. Do not change it once deletions have happened |
| `SEED_PASSWORD` | seeding only | Password for the demo accounts. Not needed by the running app |

The live demo runs with `LLM_PROVIDER=gemini` and a Gemini key (free tier), so CVs uploaded now are scored by Gemini (`gemini-3.5-flash`); the 40 pre-loaded demo candidates were scored by the built-in keyword matcher (`heuristic`). Free-tier limits can make an upload fail with a rate-limit message; the file then shows as Failed with a Retry button. Without a key the app falls back to the keyword matcher. The Anthropic and Gemini providers are implemented and unit-tested with mocked responses. The Gemini reader was run on 8 November 2026 against four sample CVs with `gemini-3.5-flash`: it extracted a sensible scorecard from the example JD and its scores matched the keyword matcher on the sample CVs, with every quote verified. The Anthropic reader is tested with mocked responses only. Setting a key and `LLM_PROVIDER` is all it takes, and a key with vision support is also what lets scanned PDFs be read (without one they go to "Needs review").

Two things worth knowing about the deployed behaviour:

- PDF parsing uses pdf.js, which needs a native canvas package. `next.config.ts` marks it external and force-includes its files for the upload routes; without that every PDF fails on Vercel.
- A client opening another client's requisition (or a staff page) receives an HTTP 200 page that says "not found" (or a redirect), with none of the data, rather than a 404/302 status. The page streams, so the status line is sent before the access check finishes. `npm run smoke` checks that no data is included.

## 4. Security notes

- Roles and the client a user belongs to come only from the database; a user cannot set them. Self sign-up is disabled and a test pins this.
- Every route handler and server action calls one permission function, `can()`; client queries are also filtered by client in SQL.
- Security headers (nosniff, frame denial, referrer and permissions policy, a Content-Security-Policy in production) are set in `next.config.ts`. Signed-in pages are marked no-store and no-index.
- Sign-in is rate limited by the auth library. The upload endpoint has no limiter of its own: put Vercel's firewall or an application limiter in front of it before real use.
- Text is redacted of name, gender, age or date of birth, photo and marital status before it goes to a language model. This is regex-based and best effort, not a trained model.
- Deletion on request removes the candidate's files, profile and cached AI output, and keeps only a keyed-hash stub in the audit log.
- More in `SECURITY.md`.
