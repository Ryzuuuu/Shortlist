# Shortlist — Assumptions

This file documents every assumption made where the brief was ambiguous or silent.
All assumptions are labelled with their impact and the step they affect.

---

## A1 — Contact Masking (DPDP + Client Portal)
**Assumption:** Client users see a candidate's name and headline but NOT phone number or email address until the candidate reaches the `shortlisted` pipeline stage for that submission.  
**Rationale:** The brief says "contacts masked for clients until shortlisted". We treat "contact" as phone + email; name and job title are shown to allow meaningful review.  
**Impact:** Affects client portal API, submission query, and DPDP compliance.

## A2 — Global Candidate Pool / Deduplication
**Assumption:** The candidate pool is global. A candidate is identified first by normalised email, then by normalised phone, then by fuzzy match on full name, most-recent company and most-recent role title. The fuzzy rule compares each part on its own (name Jaro-Winkler ≥ 0.95; company ≥ 0.90 and role ≥ 0.85 when both CVs state them) and is NOT used when the two CVs have different e-mail addresses or different phone numbers, because those are two people who happen to share a name. (A first version compared one combined "name|company|role" string at ≥ 0.92; a 500-CV test showed it merging different people at the same employer, so it was replaced.)  
**If matched:** the existing candidate record is reused; a new score row is created for the requisition.  
**If not matched:** a new candidate record is created.  
**Matching details:** e-mail comparison ignores case and `+tag` aliases and ignores dots only for Gmail (on other domains `john.smith` and `johnsmith` are different people); phone comparison uses the last ten digits, so `+91 98765 43210`, `098765 43210` and `98765-43210` match. Two copies of the same person uploaded at the same moment (uploads run four at a time) are reconciled after insertion: the later insert defers to the earlier one.
**Rationale:** User-specified in the approved plan (change #1).

## A3 — Ingestion: One File Per Request
**Assumption:** CV upload is one file per HTTP request with a 4 MB cap. The UI dispatches up to 4 concurrent requests. Each file's processing state is persisted in `cv_files.status`.  
**Rationale:** User-specified in the approved plan (change #2).

## A4 — Scanned PDF Handling
**Assumption:** If a PDF yields fewer than 50 characters of text after parsing with pdf-parse, it is treated as a scanned/image PDF. If a vision-capable LLM key is configured (`LLM_PROVIDER=anthropic` or `gemini` with a valid key), the file is sent to the vision API for text extraction. Otherwise, the file is marked `needs_review` and shown to the recruiter for manual handling.  
**Rationale:** User-specified in the approved plan (change #3). No tesseract dependency.

## A5 — Auth: Email + Password Only
**Assumption:** Authentication is email + password only. Magic links and OAuth are out of scope.  
**Rationale:** User-specified in the approved plan (change #4).

## A6 — Scorecard Weights
**Assumption:** If a recruiter does not explicitly set criterion weights, weights default to equal distribution (1/N each, where N = number of criteria).  
**Impact:** Score calculator must handle both weighted and unweighted scorecards.

## A7 — "Submitted" Stage and Client Portal Access
**Assumption:** A candidate becomes visible in the client portal as soon as a recruiter submits them (pipeline stage: `submitted`). The client cannot see candidates in `sourced` or `screened` stages.  
**Impact:** Client portal API filters by stage ≥ `submitted`.

## A8 — Consent at Upload Time
**Assumption:** By uploading a CV, the recruiter attests (on behalf of the firm) that candidate consent has been obtained for the purpose of hiring evaluation. A consent record is created automatically at upload time with `purpose = 'hiring_evaluation'`.  
**Rationale:** DPDP Act 2023 requires a consent record; we capture it at ingestion rather than requiring a separate consent flow per candidate, as this mirrors common staffing-firm practice.

## A9 — Anonymised Audit Stub on Deletion
**Assumption:** On hard-delete (DPDP deletion request), the candidate row and all files are deleted. A stub row is inserted into `audit_log` with hashed candidate ID, timestamp, and action `'candidate_deleted'` — no personal data retained.
**Detail:** the candidate ID in the stub is a keyed HMAC (`AUDIT_HASH_KEY`, falling back to `BETTER_AUTH_SECRET`), so it cannot be reversed by brute force. Existing audit rows for the candidate are re-pointed to the same anonymised ID and their metadata cleared. Stored CV files and cached AI output (which contains CV quotes) are deleted first; if a file cannot be deleted, nothing else is touched and the request can be retried.

## A10 — AI Rank vs Recruiter Agreement (Delivery Head)
**Assumption:** Each week (IST, Monday to Sunday), for every requisition with submissions, N = candidates the recruiter submitted. A submission *agrees* if its AI score is at or above the Nth-best AI score (ties count as inside, so a recruiter is never marked wrong for choosing between equal scores). Agreement % = agreeing submissions / all submissions (per requisition and overall). *Disagreements* are submitted candidates ranked below the AI's top N, listed with their rank. AI top-N picks that were not submitted are included in the CSV for context but do not affect the percentage.
**"This week":** uses `submissions.updatedAt`, which nothing touches after a recruiter submits, so it stands in for the submit time. A dedicated `submitted_at` column would be cleaner if the schema is revisited.
**Export:** CSV includes candidate names (the delivery head already has audit access); text cells are neutralised against spreadsheet formula injection.

## A11 — Broken CV Handling
**Assumption:** A file that cannot be parsed at all (corrupt, password-protected, zero bytes, unsupported MIME) is immediately marked `failed` with an error reason stored in `cv_files.error`. It appears in the recruiter's upload list with a retry button and is never silently dropped.

## A12 — Pipeline Stage Ordering
**Assumption:** Valid pipeline stages in order are: `sourced → screened → submitted → shortlisted → interview → offered → joined`. `rejected` is a terminal state reachable from any stage. Transitions are enforced by the pipeline state machine in `packages/core`.

## A20 — View Gate and the Submissions Row
**Assumption:** A `submissions` row is created the first time a recruiter opens a candidate's CV (it holds `viewedByRecruiterAt`). The row's existence does NOT make the candidate visible to clients; only the pipeline stage (`submitted` or later, A7) does. "Submit to client" is refused server-side unless `viewedByRecruiterAt` is set, in addition to being disabled in the UI.
**Impact:** Client portal queries must filter on pipeline stage, never on the presence of a submission.

## A13 — Consent Withdrawal and Right of Access
**Assumption:** Deletion on request (A9) is the only data-subject workflow built. Consent is recorded at upload (A8) and shown on the candidate page; a separate "withdraw consent" state and a data-export (right of access) flow are not built. The `consent_withdrawn_at` column exists for them.
**Impact:** Out of the core slice; listed as optional depth in the brief.

## A14 — Who Moves a Candidate Along the Pipeline
**Assumption:** Stages are moved by the actor who owns the decision. Opening a CV moves sourced to screened; the Submit button moves screened to submitted; the client moves submitted to shortlisted and shortlisted to interview (by proposing a slot); the recruiter moves interview to offered and offered to joined by hand. Either side can reject an open candidate. A recruiter-side rejection needs a reason that stays internal and is never shown to a client (A7).
**Impact:** `packages/core/src/recruiter-stages.ts`; the pipeline board shows who acts at each stage.

## A15 — Job-Description Filters Are Labels, Not Verdicts
**Assumption:** Experience, notice period, CTC (and location, if a scorecard has it) read from the JD are compared with what each CV states and shown as meets / misses / not stated. They never change a score and never hide or remove a candidate (AI rule 4). A fact the CV does not state is "not stated", not a miss. Experience is taken from the CV if it says so, otherwise computed from the work-history dates; degree years are not counted as work. Equal scores are ordered by fewest filters missed.
**Impact:** `jd-filters.ts` (`evaluateFilters`), ranked list, candidate review screen.

## A16 — Expected CTC Is Not Shown to Clients
**Assumption:** A candidate's expected or current CTC is negotiation-sensitive, so the client portal shows experience and notice period but never CTC. Recruiters see it (as a JD-filter check).

## A17 — Files Abandoned Mid-Processing Are Surfaced
**Assumption:** A file that stays `pending` or `parsing` for more than three minutes (a timed-out request or a restart) is treated as abandoned. It appears under "Needs your attention" with a Retry button, and re-selecting the same file in the upload zone re-processes it instead of skipping it as a duplicate. This upholds "never silently dropped" (AI rule 5).

## A18 — Quotes Across Redactions
**Assumption:** The AI reader sees redacted text, so a quote can accidentally span a `[REDACTED:...]` marker, which is not in the original CV. Rather than discard the whole claim, the longest marker-free part of the quote that exists verbatim in the original CV (at least 8 characters) is kept as the evidence. Nothing is ever rewritten or added, so AI rule 2 holds; if no such part exists the claim is unverified and counts as unknown.

## A19 — Success Measures
**Assumption:** "Shortlist within 48 hours" is measured from a requisition's creation to the first submission recorded in the audit log; a requisition open longer than 48 hours with nothing submitted counts as a miss, a newer one is not counted yet. "Client acceptance" is shortlists divided by shortlists plus rejections. Screening-time reduction is not measured because there is no baseline from the old process.

## A21 — What "Below fit" Means
**Assumption:** The brief says low scorers must stay searchable but does not define "low". A candidate is labelled **Below fit** when the weighted score is under 40 out of 100, or when any must-have criterion is not met (or unknown). It is a label only: the candidate stays in the list, in search and in every filter, and can still be submitted.
**Impact:** `packages/core/src/score-calculator.ts`; the "Below fit" filter on the ranked list.

## A22 — Demo Data Is Synthetic
**Assumption:** The brief forbids real personal data. The two clients (Meridian Bank Services, Kestrel Retail), the 44 CVs, and every name, e-mail address (`example.com`) and phone number (`+91 90000 xxxxx`) are invented. The seed is deterministic, so the same data can be recreated.
**Impact:** `scripts/seed/`, `seed/cvs/`.

## A23 — Default AI Reader Is a Keyword Matcher
**Assumption:** The brief asks for an AI score but gives no model or key. So that the product works end to end with no key and can be tested deterministically, the default reader (`LLM_PROVIDER=heuristic`) is a whole-word keyword matcher that obeys the same AI rules (verified quotes, code-computed score, never rejects). Anthropic and Gemini readers are built behind the same interface and are used when a key and `LLM_PROVIDER` are set. They are tested with mocked responses. The Gemini reader was run on 8 November 2026 against four sample CVs with `gemini-3.5-flash`: it extracted a sensible scorecard from the example JD and its scores matched the keyword matcher on the sample CVs, with every quote verified. The Anthropic reader is tested with mocked responses only.
**Impact:** `src/lib/llm/`; the live demo runs on the keyword matcher.

## A24 — Roles and Accounts
**Assumption:** Recruiters work across all clients and requisitions (no per-recruiter assignment). The delivery head has full access under the policy (insights, audit log, export). There is no in-app user or client management: accounts and clients are created by the seed script or directly in the database, and self sign-up is disabled.
**Impact:** `packages/core/src/policy.ts`, `scripts/seed/`.

## A25 — One Shared Demo
**Assumption:** The live demo uses one database and one set of demo accounts for every reviewer, so what one reviewer does (submit, shortlist, delete) is visible to the next. Nothing in it is real.
**Impact:** `deployment.md`.
