# Shortlist

AI-assisted CV screening for a staffing firm, with a shortlist portal for clients.
Recruiters upload a pile of CVs against a job and see the best fits first, each with evidence quoted from the CV.
Clients review submitted candidates on their phones. A delivery head sees how the AI's ranking compares with
recruiters' choices. Built as a take-home for a Software Engineering Intern role.

**Live demo:** https://shortlist-six-flax.vercel.app (demo accounts below; ask the author for the password).

## What it does

1. **JD intake.** Paste a job description; get an editable scorecard (criteria, weights, must-haves) plus experience, notice and CTC filters read from the text.
2. **Bulk CV upload.** PDF or DOCX, up to 4 MB each, up to 500 at a time. One file per request, 4 in parallel, per-file status saved so interrupted uploads resume. Failed and unreadable files stay visible with a Retry button.
3. **Ranked list with evidence.** Score, per-criterion result, the best verified quote and the next action, per row. Search by name, role or skill and filter by Fit / Below fit / Needs review: nobody is ever removed. The JD's experience, notice and CTC limits show on each candidate as labels, never as verdicts. Split-view CV: click evidence to highlight it in the CV text.
4. **Submit to client.** Disabled until the recruiter has opened the CV (logged as `viewedByRecruiterAt`, and enforced again on the server).
5. **Client portal (mobile-first).** Contacts masked until shortlisted. Shortlist, reject with a reason, or propose an interview time.
6. **Pipeline.** A board per requisition from Sourced to Joined. The recruiter moves candidates to Offered and Joined or rejects with an internal reason; the client's decisions move the rest.
7. **Delivery dashboard.** The brief's success measures (shortlist within 48 hours, client acceptance), weekly AI-rank vs recruiter-choice agreement with disagreements and CSV export, and an audit log.
8. **DPDP Act 2023.** Consent record per candidate (hiring only), deletion on request (profile, files and AI cache removed; anonymised audit stub kept), and a log of who viewed what.

## The AI rules (and where they are enforced)

| Rule | Where |
| --- | --- |
| The LLM returns only per-criterion `{met, quote, confidence}`; code computes the score from the scorecard weights | `packages/core/src/score-calculator.ts` |
| Every quote must be a substring of the CV (whitespace and case normalised); otherwise it is dropped and marked unverified, and the claim counts as unknown | `quote-verifier.ts`, `src/lib/ingestion/process.ts` |
| Name, gender, age/DOB, photo and marital status are redacted before text reaches the LLM | `redact.ts` |
| The AI never rejects anyone; low scorers stay in the list, labelled "below fit" | `process.ts`, ranked table |
| Low confidence, scans without a vision provider, or parse failures go to "Needs review", never dropped | `process.ts`, attention list |
| Results are cached by content hash and scorecard | `src/lib/llm/index.ts` |

`LLM_PROVIDER` is `anthropic`, `gemini` or `heuristic`. With `heuristic` (the default) the app works with no API key, using whole-word keyword matching. The Anthropic provider uses the official SDK with schema-constrained output (model from `ANTHROPIC_MODEL`, default `claude-opus-5-5`); the Gemini provider reads `GEMINI_MODEL`. CV text is treated as untrusted in every prompt.

## Access control

One function, `can(user, action, resource)` in `packages/core/src/policy.ts`, is called by every route handler and server action. Clients are limited to their own organisation's requisitions, and queries are also scoped by `clientId` in SQL. Self-sign-up is disabled; accounts and roles come from the seed script.

## Run locally

Needs Node 20+ and a Postgres database (a free [Neon](https://neon.tech) project works).

```bash
npm install
cp .env.example .env.local   # set DATABASE_URL and BETTER_AUTH_SECRET (32+ random characters)
npm run db:migrate
npm run db:seed
npm run dev
```

The seed loads a demo client, a requisition with a scorecard, and 44 synthetic CVs (including 2 duplicates, 1 scan and 1 corrupt file)
through the real pipeline. Demo logins: `recruiter@shortlist.test`, `client.meridian@shortlist.test`, `head@shortlist.test`.
The password is whatever you set in `SEED_PASSWORD` (required, 12+ characters; there is deliberately no default because this repository is public). The same CVs are in `seed/cvs/` for trying the upload screen by hand.

A committed `.npmrc` sets `legacy-peer-deps` because `vitest` and `@types/node@20` have conflicting peer ranges; without it a plain `npm install` fails with ERESOLVE (`npm ci` is unaffected).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` / `lint` / `test` | Checks (all must pass before a commit; the same run in CI) |
| `npm run smoke` | End-to-end checks against a running deployment (`BASE_URL`, `SEED_PASSWORD`, optional `UPLOAD_PDF`) |
| `npm run db:migrate` / `db:generate` / `db:studio` | Drizzle |
| `npm run db:seed` / `seed:cvs` | Demo data / regenerate `seed/cvs` |
| `npm run db:rescore` / `db:reextract` | Re-score every candidate / re-derive profiles and de-duplication keys, after changing the scorer or extractor |

## Layout

```
packages/core/   pure domain logic, no framework imports (policy, redaction, scoring, dedup, pipeline, agreement)
src/app/         recruiter/, portal/ (client), delivery/, api/
src/lib/         auth, ingestion, llm providers, queries, compliance
scripts/seed/    synthetic CVs and demo seed
docs/            REQUIREMENTS.md (brief -> code -> test), ASSUMPTIONS.md, DEPLOYMENT.md
SECURITY.md      security model, known limitations, how to report
```

Every item in the brief is traced to its code and its test in [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md).
Every assumption made where the brief was silent is labelled in [`docs/ASSUMPTIONS.md`](docs/ASSUMPTIONS.md).
Deployment steps are in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Known limits

- Scanned PDFs are read only if a vision-capable provider key is configured; otherwise they go to "Needs review". There is no on-device OCR by design.
- The heuristic provider matches keywords; it cannot judge numeric rules such as "5-8 years". Those are stored as scorecard filters.
- Interview proposals and messages are stored, not sent anywhere (outside systems are mocked, per the brief).
- A separate "withdraw consent" flow and a data-export flow are not built (see A13).
