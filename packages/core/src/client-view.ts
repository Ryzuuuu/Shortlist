/**
 * packages/core/src/client-view.ts
 *
 * Rules for what a client hiring manager may see and do (ASSUMPTIONS A1, A7).
 * Pure functions so the privacy rules are unit-tested, not buried in queries.
 */
import type { PipelineStage } from './pipeline'

/** Stages in which a candidate exists for a client at all (A7). */
const VISIBLE: ReadonlySet<PipelineStage> = new Set(['submitted', 'shortlisted', 'interview', 'offered', 'joined'])

/** Contacts unmask once the client has shortlisted the candidate (A1). */
const CONTACT_STAGES: ReadonlySet<PipelineStage> = new Set(['shortlisted', 'interview', 'offered', 'joined'])

export type ClientAction = 'shortlist' | 'reject' | 'propose_interview'

const ACTIONS: Partial<Record<PipelineStage, ClientAction[]>> = {
  submitted: ['shortlist', 'reject'],
  shortlisted: ['propose_interview', 'reject'],
}

/**
 * Whether a client can see a candidate in this stage. A rejected candidate stays
 * visible only if the CLIENT rejected them; a recruiter-side rejection never
 * reaches a client.
 */
export function isVisibleToClient(stage: PipelineStage, rejectedByClient = false): boolean {
  if (stage === 'rejected') return rejectedByClient
  return VISIBLE.has(stage)
}

export function contactsVisible(stage: PipelineStage): boolean {
  return CONTACT_STAGES.has(stage)
}

export function allowedClientActions(stage: PipelineStage): ClientAction[] {
  return ACTIONS[stage] ?? []
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
// 10+ digits with optional separators / country code
const PHONE = /(?:\+?\d[\d\s().-]{8,}\d)/g

/** Hide emails and phone numbers inside free text (e.g. an evidence quote). */
export function maskContactDetails(text: string): string {
  return text.replace(EMAIL, '[hidden]').replace(PHONE, (m) => (m.replace(/\D/g, '').length >= 10 ? '[hidden]' : m))
}
