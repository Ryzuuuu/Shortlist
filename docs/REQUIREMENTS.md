# Requirements traceability

Every item in the brief, where it lives in the code, and how it is checked. "Checked by" names an automated test
(`npm test`, 270+ tests) or the live smoke test (`npm run smoke`, which runs against a deployment).

## Must have

| Brief | Where | Checked by |
| --- | --- | --- |
| **JD intake**: AI extracts must-have skills, experience, CTC and notice into an editable scorecard | `src/app/recruiter/requisitions/new/` (form and server actions); criteria from the LLM provider, experience / notice / CTC from `packages/core/src/jd-filters.ts` | `jd-filters.test.ts`, `llm.test.ts` (scorecard extraction and validation) |
| **Bulk CV upload** (PDF or DOCX, up to 500) | `upload-zone.tsx` (4 in parallel, one file per request, retry, resumable), `/api/upload`, `/api/upload/retry`, 4 MB cap, magic-byte validation | `upload-validation.test.ts`, `api/upload/route.test.ts`, smoke (real upload) |
| **Parsed into profiles** | `packages/core/src/profile-extract.ts` (name, contacts, role, company, skills, work history, education, experience from dates, notice, CTC) | `profile-extract.test.ts` (five different CV layouts), `scripts/seed/seed.test.ts` (all 40 seeded CVs) |
| **Duplicate detection** | `packages/core/src/dedup.ts` (e-mail, then phone, then fuzzy name+company+role) and `process.ts` (also handles two copies uploaded at the same moment) | `dedup.test.ts`, `process.test.ts`, seed test (duplicates matched by e-mail and by phone) |
| **AI score per CV with evidence quoted from the CV, per criterion** | `src/lib/ingestion/process.ts` (`scoreCandidate`), `src/lib/llm/`, ranked list and split-view CV | `process.test.ts`, `scripts/seed/scoring.test.ts`, `llm.test.ts` |
| **Client portal**, masked contacts; shortlist, reject with a reason, propose an interview slot | `src/app/portal/`, `packages/core/src/client-view.ts`, `src/lib/queries/portal.ts` | `client-view.test.ts`, `portal/actions.test.ts`, smoke (isolation with a control) |
| **Pipeline per requisition, sourced to joined** | `/recruiter/requisitions/[id]/pipeline` (board), `packages/core/src/pipeline.ts` and `recruiter-stages.ts` | `pipeline.test.ts`, `recruiter-stages.test.ts`, `pipeline/actions.test.ts` |
| **Candidate consent record and deletion on request** | consent defaults at ingestion; `src/lib/compliance/delete-candidate.ts`; privacy panel on the candidate page | `delete-candidate.test.ts` |

## Core build: the screens

JD scorecard (`/recruiter/requisitions/new`), bulk upload and parsing (requisition page), ranked list with evidence
(requisition page), split-view CV with clickable evidence, client shortlist portal (`/portal`), pipeline board,
delivery dashboard and audit log. Roles: recruiter and client hiring manager, plus the delivery head.

## AI and automation

| Rule | Where it is enforced | Checked by |
| --- | --- | --- |
| The AI never rejects anyone automatically; low scorers stay searchable | Low scores are labelled "Below fit", never removed; the ranked list has search and filters; JD filters are labels | `process.test.ts` (rule 4), `scoring.test.ts` (nobody dropped) |
| Every score shows its evidence | Quoted, verified evidence per criterion on the list, the review screen and the client portal | `process.test.ts`, `scoring.test.ts` (no unverified claims across all 40 seeded CVs) |
| A recruiter must open a CV before submitting | Gate in the UI and again on the server (`submitCandidate`) | smoke, `candidate actions` |
| Name, gender, age, photo and marital status hidden from scoring | `packages/core/src/redact.ts`, applied before every model call | `redact.test.ts`, `process.test.ts` (rule 3) |
| The score is computed by code; quotes are verified | `score-calculator.ts`, `quote-verifier.ts` | `score-calculator.test.ts`, `quote-verifier.test.ts`, `process.test.ts` (rules 1 and 2) |
| Low confidence or a parse failure goes to "Needs review", never silently dropped | `process.ts`, "Needs your attention" list, recovery of abandoned files | `process.test.ts` (rule 5), `upload/route.test.ts` |
| A weekly sample compares AI ranks with recruiter choices for the delivery head | `/delivery`, CSV export | `agreement.test.ts`, `api/delivery/agreement/route.test.ts` |

## Constraints

| Brief | How it is met |
| --- | --- |
| DPDP Act 2023: consent, hiring use only, deletion on request, a log of who viewed what | Consent record per candidate; deletion removes profile, files and cached AI output and keeps an anonymised stub; audit log of views, submissions, client decisions and deletions (`/delivery/audit`) |
| Each client sees only candidates submitted to them | `can()` plus a `clientId` filter in every portal query; clients never receive CV text; verified live with a control |
| Some CVs are scans | Vision-model transcription when a provider key exists, otherwise "Needs review" (no on-device OCR, by design) |
| Clients review on phones | Mobile-first portal; 16px inputs and 44px tap targets on phones; no horizontal overflow (measured at 375px) |

## Design

Warm off-white `#FAF9F6`, ink `#1A1A2E`, one accent `#C96A2B`; Playfair Display headings with Inter body; spacing on an 8px grid; every screen has loading, empty and error states; the 404 page does not reveal whether a restricted page exists. Score, evidence and next action are visible per row.

## Success measures

| Brief | Status |
| --- | --- |
| Shortlist within 48 hours for 80% of requisitions | Measured on the delivery dashboard (`success-metrics.ts`) |
| Client acceptance from 45% to 60% | Measured on the delivery dashboard |
| Screening time per requisition down 60% | **Not measured**: it needs a baseline from the old process |

## Out of scope (as the brief says)

Job-board integrations, video interviews, background verification. Payments, messages and outside systems are mocked: interview proposals are stored, not sent.

## Instructions given during the build

| Instruction | Status |
| --- | --- |
| Single `can(user, action, resource)` used everywhere, with unit tests (client A cannot read client B; recruiter cannot reach insights; anonymous denied) | `policy.ts`, `policy.test.ts` |
| Better Auth user table extended with `role` and `clientId`; sign-up cannot set a role | `auth.ts`; sign-up is disabled entirely; `auth.test.ts` |
| Seed with about 40 synthetic CVs (2 duplicates, 1 scan, 1 broken) and precomputed scores | `scripts/seed/` (44 files), `npm run db:seed` |
| API tests for client isolation and upload validation | `portal/actions.test.ts`, `upload/route.test.ts`, `npm run smoke` |
| Dedup is global; match on e-mail, phone, then fuzzy name+company+role | `dedup.ts`, `process.ts` |
| No `.env` or secrets tracked in git | Verified across the full history; secret scanning and push protection are enabled |
| Deployment document; commit after every step | `deployment.md`; small commits throughout |

## Known gaps

- Withdrawing consent as a separate state, and a data-export (right of access) flow, are not built (A13).
- Screening-time reduction cannot be measured without a baseline.
- Scanned CVs need a vision-capable provider key; otherwise they wait in "Needs review".
- The heuristic scorer (default, no key) matches keywords and cannot judge numeric rules; those are applied as JD filters instead.
- The Anthropic and Gemini providers are unit-tested against stand-ins but have not been run against the live APIs (no keys were available).
