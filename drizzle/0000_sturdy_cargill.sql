CREATE TYPE "public"."cv_file_status" AS ENUM('pending', 'parsing', 'scored', 'failed', 'needs_review');--> statement-breakpoint
CREATE TYPE "public"."llm_provider" AS ENUM('anthropic', 'gemini', 'heuristic');--> statement-breakpoint
CREATE TYPE "public"."pipeline_stage" AS ENUM('sourced', 'screened', 'submitted', 'shortlisted', 'interview', 'offered', 'joined', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('recruiter', 'client', 'delivery_head');--> statement-breakpoint
CREATE TYPE "public"."score_criterion_result" AS ENUM('yes', 'partial', 'no', 'unknown');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_review_samples" (
	"id" text PRIMARY KEY NOT NULL,
	"content_hash" text NOT NULL,
	"scorecard_id" text NOT NULL,
	"llm_provider" "llm_provider" NOT NULL,
	"raw_response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"candidate_id" text,
	"requisition_id" text,
	"action" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"profile" jsonb NOT NULL,
	"raw_text" text NOT NULL,
	"content_hash" text NOT NULL,
	"normalised_email" text,
	"normalised_phone" text,
	"consent_given" boolean DEFAULT true NOT NULL,
	"consent_purpose" text DEFAULT 'hiring_evaluation' NOT NULL,
	"consent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consent_withdrawn_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"reason" text,
	"proposed_slot" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"industry" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cv_files" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text,
	"requisition_id" text NOT NULL,
	"uploaded_by_user_id" text NOT NULL,
	"storage_url" text,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"content_hash" text NOT NULL,
	"status" "cv_file_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"is_scanned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"requisition_id" text NOT NULL,
	"stage" "pipeline_stage" DEFAULT 'sourced' NOT NULL,
	"rejection_reason" text,
	"updated_by_user_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requisitions" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"title" text NOT NULL,
	"jd_text" text NOT NULL,
	"is_open" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scorecards" (
	"id" text PRIMARY KEY NOT NULL,
	"requisition_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"criteria" jsonb NOT NULL,
	"filters" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"requisition_id" text NOT NULL,
	"scorecard_id" text NOT NULL,
	"per_criterion" jsonb NOT NULL,
	"total" real DEFAULT 0 NOT NULL,
	"is_below_fit" boolean DEFAULT false NOT NULL,
	"llm_provider" "llm_provider" DEFAULT 'heuristic' NOT NULL,
	"from_cache" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"requisition_id" text NOT NULL,
	"submitted_by_user_id" text NOT NULL,
	"viewed_by_recruiter_at" timestamp with time zone,
	"viewed_by_client_at" timestamp with time zone,
	"recruiter_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "role" DEFAULT 'recruiter' NOT NULL,
	"client_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_review_samples" ADD CONSTRAINT "ai_review_samples_scorecard_id_scorecards_id_fk" FOREIGN KEY ("scorecard_id") REFERENCES "public"."scorecards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_feedback" ADD CONSTRAINT "client_feedback_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_feedback" ADD CONSTRAINT "client_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_files" ADD CONSTRAINT "cv_files_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_files" ADD CONSTRAINT "cv_files_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_files" ADD CONSTRAINT "cv_files_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_entries" ADD CONSTRAINT "pipeline_entries_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_entries" ADD CONSTRAINT "pipeline_entries_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_entries" ADD CONSTRAINT "pipeline_entries_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_scorecard_id_scorecards_id_fk" FOREIGN KEY ("scorecard_id") REFERENCES "public"."scorecards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "airs_hash_sc_uidx" ON "ai_review_samples" USING btree ("content_hash","scorecard_id");--> statement-breakpoint
CREATE INDEX "al_user_idx" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "al_cand_idx" ON "audit_log" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "al_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cand_email_idx" ON "candidates" USING btree ("normalised_email");--> statement-breakpoint
CREATE INDEX "cand_phone_idx" ON "candidates" USING btree ("normalised_phone");--> statement-breakpoint
CREATE INDEX "cand_hash_idx" ON "candidates" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "cvf_req_idx" ON "cv_files" USING btree ("requisition_id");--> statement-breakpoint
CREATE INDEX "cvf_hash_idx" ON "cv_files" USING btree ("content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "pe_cand_req_uidx" ON "pipeline_entries" USING btree ("candidate_id","requisition_id");--> statement-breakpoint
CREATE INDEX "pe_req_idx" ON "pipeline_entries" USING btree ("requisition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sc_req_version_uidx" ON "scorecards" USING btree ("requisition_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "scores_cand_req_sc_uidx" ON "scores" USING btree ("candidate_id","requisition_id","scorecard_id");--> statement-breakpoint
CREATE INDEX "scores_req_idx" ON "scores" USING btree ("requisition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sub_cand_req_uidx" ON "submissions" USING btree ("candidate_id","requisition_id");