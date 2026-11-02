/**
 * Drizzle ORM schema for Shortlist.
 * All tables use cuid2 for IDs (client-generated, URL-safe).
 * jsonb columns are typed with explicit TS interfaces in types.ts.
 */
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  real,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

// ─── Enums ────────────────────────────────────────────────────────────────────

export const roleEnum = pgEnum('role', ['recruiter', 'client', 'delivery_head'])

export const pipelineStageEnum = pgEnum('pipeline_stage', [
  'sourced',
  'screened',
  'submitted',
  'shortlisted',
  'interview',
  'offered',
  'joined',
  'rejected',
])

export const cvFileStatusEnum = pgEnum('cv_file_status', [
  'pending',
  'parsing',
  'scored',
  'failed',
  'needs_review',
])

export const scoreCriterionResultEnum = pgEnum('score_criterion_result', [
  'yes',
  'partial',
  'no',
  'unknown',
])

export const llmProviderEnum = pgEnum('llm_provider', [
  'anthropic',
  'gemini',
  'heuristic',
])

// ─── Users ────────────────────────────────────────────────────────────────────

/**
 * Better Auth will manage this table; we extend it with role + clientId.
 * Better Auth requires: id, name, email, emailVerified, image, createdAt, updatedAt.
 */
export const users = pgTable('users', {
  id: text('id').primaryKey(), // cuid2
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  role: roleEnum('role').notNull().default('recruiter'),
  // client-role users are scoped to exactly one client organisation
  clientId: text('client_id').references(() => clients.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})

// ─── Better Auth sessions / accounts / verifications ─────────────────────────

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
    withTimezone: true,
  }),
  scope: text('scope'),
  idToken: text('id_token'),
  password: text('password'), // hashed — email+password flow
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export const verifications = pgTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

// ─── Clients ──────────────────────────────────────────────────────────────────

export const clients = pgTable('clients', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  industry: text('industry'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})

// ─── Requisitions ─────────────────────────────────────────────────────────────

export const requisitions = pgTable('requisitions', {
  id: text('id').primaryKey(),
  clientId: text('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'restrict' }),
  createdByUserId: text('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  title: text('title').notNull(),
  jdText: text('jd_text').notNull(),
  isOpen: boolean('is_open').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})

// ─── Scorecards ───────────────────────────────────────────────────────────────

/**
 * Scorecards are versioned. Scoring a candidate always references a specific
 * scorecard version so historical scores remain meaningful.
 */
export const scorecards = pgTable(
  'scorecards',
  {
    id: text('id').primaryKey(),
    requisitionId: text('requisition_id')
      .notNull()
      .references(() => requisitions.id, { onDelete: 'cascade' }),
    version: integer('version').notNull().default(1),
    /**
     * criteria: ScorecardCriterion[]
     * [{ id, label, description, weight, mustHave }]
     */
    criteria: jsonb('criteria').notNull(),
    /** filters: hard-rejection filters applied before scoring */
    filters: jsonb('filters'), // FilterRule[]
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex('sc_req_version_uidx').on(t.requisitionId, t.version)],
)

// ─── Candidates ───────────────────────────────────────────────────────────────

/**
 * Global candidate pool. One record per unique individual.
 * Dedup: normalised email → phone → fuzzy name+company+role (Jaro-Winkler ≥ 0.92).
 */
export const candidates = pgTable(
  'candidates',
  {
    id: text('id').primaryKey(),
    /**
     * profile: CandidateProfile
     * { firstName, lastName, email, phone, headline, currentCompany, currentRole,
     *   location, skills[], workHistory[], education[] }
     */
    profile: jsonb('profile').notNull(),
    /** Raw extracted text (post-parse, pre-redaction). Used for quote verification. */
    rawText: text('raw_text').notNull(),
    /** SHA-256 of the original file bytes. */
    contentHash: text('content_hash').notNull(),
    /** Normalised email for dedup lookups */
    normalisedEmail: text('normalised_email'),
    /** Normalised phone (E.164) for dedup lookups */
    normalisedPhone: text('normalised_phone'),
    // DPDP Act 2023 consent fields
    consentGiven: boolean('consent_given').default(true).notNull(),
    consentPurpose: text('consent_purpose')
      .default('hiring_evaluation')
      .notNull(),
    consentAt: timestamp('consent_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    consentWithdrawnAt: timestamp('consent_withdrawn_at', {
      withTimezone: true,
    }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }), // soft-flag; hard delete done in deletion endpoint
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index('cand_email_idx').on(t.normalisedEmail),
    index('cand_phone_idx').on(t.normalisedPhone),
    index('cand_hash_idx').on(t.contentHash),
  ],
)

// ─── CV Files ─────────────────────────────────────────────────────────────────

/**
 * One row per uploaded file. A candidate may have multiple source files
 * across requisitions.
 */
export const cvFiles = pgTable(
  'cv_files',
  {
    id: text('id').primaryKey(),
    candidateId: text('candidate_id').references(() => candidates.id, {
      onDelete: 'cascade',
    }),
    requisitionId: text('requisition_id')
      .notNull()
      .references(() => requisitions.id, { onDelete: 'cascade' }),
    uploadedByUserId: text('uploaded_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** Vercel Blob URL */
    storageUrl: text('storage_url'),
    originalFilename: text('original_filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    contentHash: text('content_hash').notNull(),
    status: cvFileStatusEnum('status').default('pending').notNull(),
    errorMessage: text('error_message'),
    /** True if parsed text was very short (< 50 chars) — treated as scanned */
    isScanned: boolean('is_scanned').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index('cvf_req_idx').on(t.requisitionId),
    index('cvf_hash_idx').on(t.contentHash),
  ],
)

// ─── Scores ───────────────────────────────────────────────────────────────────

/**
 * One score row per (candidate × requisition × scorecard version).
 * Recomputed if the scorecard changes version.
 */
export const scores = pgTable(
  'scores',
  {
    id: text('id').primaryKey(),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    requisitionId: text('requisition_id')
      .notNull()
      .references(() => requisitions.id, { onDelete: 'cascade' }),
    scorecardId: text('scorecard_id')
      .notNull()
      .references(() => scorecards.id, { onDelete: 'restrict' }),
    /**
     * perCriterion: Record<criterionId, CriterionScore>
     * { met: 'yes'|'partial'|'no'|'unknown', quote: string|null,
     *   confidence: number, verified: boolean, unverifiedReason?: string }
     */
    perCriterion: jsonb('per_criterion').notNull(),
    /** Deterministic weighted sum, 0–100 */
    total: real('total').notNull().default(0),
    /** 'below_fit' if total < threshold; used to label low scorers */
    isBelowFit: boolean('is_below_fit').default(false).notNull(),
    /** LLM provider used for this scoring run */
    llmProvider: llmProviderEnum('llm_provider').notNull().default('heuristic'),
    /** Cache hit — true if results came from ai_review_samples cache */
    fromCache: boolean('from_cache').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex('scores_cand_req_sc_uidx').on(
      t.candidateId,
      t.requisitionId,
      t.scorecardId,
    ),
    index('scores_req_idx').on(t.requisitionId),
  ],
)

// ─── AI Review Samples (LLM result cache) ─────────────────────────────────────

/**
 * Cache keyed by (contentHash + scorecardId).
 * Prevents re-calling the LLM for the same CV against the same scorecard version.
 */
export const aiReviewSamples = pgTable(
  'ai_review_samples',
  {
    id: text('id').primaryKey(),
    contentHash: text('content_hash').notNull(),
    scorecardId: text('scorecard_id')
      .notNull()
      .references(() => scorecards.id, { onDelete: 'cascade' }),
    llmProvider: llmProviderEnum('llm_provider').notNull(),
    /**
     * rawResponse: LLMCriterionResponse[]
     * [{ criterionId, met, quote, confidence }]
     */
    rawResponse: jsonb('raw_response').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex('airs_hash_sc_uidx').on(t.contentHash, t.scorecardId),
  ],
)

// ─── Pipeline Entries ─────────────────────────────────────────────────────────

/**
 * Tracks the current pipeline stage for a (candidate × requisition) pair.
 * History is in audit_log; this row holds the current state only.
 */
export const pipelineEntries = pgTable(
  'pipeline_entries',
  {
    id: text('id').primaryKey(),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    requisitionId: text('requisition_id')
      .notNull()
      .references(() => requisitions.id, { onDelete: 'cascade' }),
    stage: pipelineStageEnum('stage').notNull().default('sourced'),
    rejectionReason: text('rejection_reason'),
    updatedByUserId: text('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex('pe_cand_req_uidx').on(t.candidateId, t.requisitionId),
    index('pe_req_idx').on(t.requisitionId),
  ],
)

// ─── Submissions ──────────────────────────────────────────────────────────────

/**
 * When a recruiter submits a candidate to a client.
 * viewedByRecruiterAt must be set before submission is allowed.
 * viewedByClientAt is set when the client first opens the portal card.
 */
export const submissions = pgTable(
  'submissions',
  {
    id: text('id').primaryKey(),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    requisitionId: text('requisition_id')
      .notNull()
      .references(() => requisitions.id, { onDelete: 'cascade' }),
    submittedByUserId: text('submitted_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    viewedByRecruiterAt: timestamp('viewed_by_recruiter_at', {
      withTimezone: true,
    }),
    viewedByClientAt: timestamp('viewed_by_client_at', { withTimezone: true }),
    recruiterNote: text('recruiter_note'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex('sub_cand_req_uidx').on(t.candidateId, t.requisitionId),
  ],
)

// ─── Client Feedback ──────────────────────────────────────────────────────────

export const clientFeedback = pgTable('client_feedback', {
  id: text('id').primaryKey(),
  submissionId: text('submission_id')
    .notNull()
    .references(() => submissions.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  action: text('action').notNull(), // 'shortlist' | 'reject' | 'propose_interview'
  reason: text('reason'),
  /** ISO 8601 datetime string for proposed interview slot */
  proposedSlot: text('proposed_slot'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})

// ─── Audit Log ────────────────────────────────────────────────────────────────

/**
 * Append-only audit log. Never updated, never deleted (except anonymised stub on candidate delete).
 * Records who viewed/actioned what and when — DPDP Act 2023 compliance.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    userId: text('user_id'), // null for system actions; hashed ID after candidate deletion
    candidateId: text('candidate_id'), // null/hashed after deletion
    requisitionId: text('requisition_id'),
    action: text('action').notNull(), // e.g. 'candidate_viewed', 'candidate_submitted', 'candidate_deleted'
    /** Extra metadata: IP, user agent, stage transitions, etc. */
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index('al_user_idx').on(t.userId),
    index('al_cand_idx').on(t.candidateId),
    index('al_created_idx').on(t.createdAt),
  ],
)
