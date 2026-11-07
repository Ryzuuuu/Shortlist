# Security

Shortlist handles CVs, which are personal data under India's Digital Personal Data Protection Act 2023.
This page describes how that is protected and how to report a problem.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting for this repository
(Security tab, "Report a vulnerability"). Include steps to reproduce and what you could access.

## What is protected, and how

| Area | Control |
| --- | --- |
| Authentication | Email and password via Better Auth. Self-registration is disabled; accounts and roles are created server-side only. Sign-in is rate limited. Sessions are HttpOnly, Secure cookies. |
| Authorisation | One function, `can(user, action, resource)` in `packages/core`, used by every route handler and server action. Clients are confined to their own organisation both in `can()` and in SQL (`clientId` filter). |
| Candidate privacy | Contacts are masked from clients until a candidate is shortlisted. Clients never receive the raw CV text. The candidate's name, titles, e-mail, phone, gender words and pronouns, age and date of birth, marital status, parents' and spouse's names and photo mentions are redacted before any text reaches an LLM (best-effort regex, not a trained model). |
| AI safety | The model returns only per-criterion judgements; the score is computed in code. Every quote is verified against the CV and dropped if it is not there. The AI never rejects anyone. CV text is treated as untrusted input in every prompt. |
| Data rights | Consent is recorded per candidate (hiring only). Deletion on request removes the profile, stored files and cached AI output and leaves only an anonymised, keyed-hash audit stub. A log records who viewed what and when. |
| Transport and browser | HTTPS only (HSTS). Content-Security-Policy, frame denial, `nosniff`, referrer and permissions policies, no-store caching for pages and APIs that carry personal data, and a no-index policy. |
| Secrets | Nothing secret is committed. `.env*` files are git-ignored (only `.env.example`, which holds placeholders, is tracked). The seed script has no default password. GitHub secret scanning and push protection are enabled. |
| Supply chain | `npm audit` for production dependencies runs in CI (high and above). Dependabot proposes updates weekly. Lockfile installs only (`npm ci`). |

## Known limitations

- **Dev-tooling advisories.** `npm audit` reports moderate advisories in `eslint`, `typescript-eslint` and `esbuild` (via
  `drizzle-kit`). These are build and lint tools that never ship or run in production. The "fixes" npm suggests are
  downgrades to ancient major versions, so they are deliberately not applied.
- **CSP keeps `'unsafe-inline'` for scripts.** A nonce-based policy would force every page to render dynamically, which
  conflicts with this project's Cache Components setup. The policy still blocks third-party scripts, framing, plugins and
  cross-origin form posts.
- **No rate limit on the upload endpoint** beyond the file-size and type checks; add a platform limiter (for example Vercel's
  WAF) before real use.
- **Redaction is regex based**, not a trained model, so unusual formats of personal details can slip through.
- **Not built:** withdrawal of consent as a separate state, and a data-export (right of access) flow (see `docs/ASSUMPTIONS.md`, A13).
