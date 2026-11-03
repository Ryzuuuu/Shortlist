# Shortlist — Assumptions

This file documents every assumption made where the brief was ambiguous or silent.
All assumptions are labelled with their impact and the step they affect.

---

## A1 — Contact Masking (DPDP + Client Portal)
**Assumption:** Client users see a candidate's name and headline but NOT phone number or email address until the candidate reaches the `shortlisted` pipeline stage for that submission.  
**Rationale:** The brief says "contacts masked for clients until shortlisted". We treat "contact" as phone + email; name and job title are shown to allow meaningful review.  
**Impact:** Affects client portal API, submission query, and DPDP compliance.

## A2 — Global Candidate Pool / Deduplication
**Assumption:** The candidate pool is global. A candidate is identified first by normalised email, then by normalised phone, then by fuzzy match on (full name + most-recent company + most-recent role title) with a Jaro-Winkler similarity ≥ 0.92.  
**If matched:** the existing candidate record is reused; a new score row is created for the requisition.  
**If not matched:** a new candidate record is created.  
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

## A12 — View Gate and the Submissions Row
**Assumption:** A `submissions` row is created the first time a recruiter opens a candidate's CV (it holds `viewedByRecruiterAt`). The row's existence does NOT make the candidate visible to clients; only the pipeline stage (`submitted` or later, A7) does. "Submit to client" is refused server-side unless `viewedByRecruiterAt` is set, in addition to being disabled in the UI.
**Impact:** Client portal queries must filter on pipeline stage, never on the presence of a submission.

## A13 — Consent Withdrawal and Right of Access
**Assumption:** Deletion on request (A9) is the only data-subject workflow built. Consent is recorded at upload (A8) and shown on the candidate page; a separate "withdraw consent" state and a data-export (right of access) flow are not built. The `consent_withdrawn_at` column exists for them.
**Impact:** Out of the core slice; listed as optional depth in the brief.
