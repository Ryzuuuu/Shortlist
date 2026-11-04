/**
 * src/lib/llm/providers/anthropic.ts
 *
 * Claude provider. Active when LLM_PROVIDER=anthropic and ANTHROPIC_API_KEY is set.
 *
 * The model only ever returns per-criterion {met, quote, confidence} (AI rule 1):
 * the total is computed later by code. Answers are schema-constrained, so they
 * arrive as valid JSON, and are then validated again by normaliseCriteria().
 * Scanned PDFs are sent as native `document` blocks (AI rule 5 fallback).
 */
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import type { ScorecardCriterion } from '@/db/types'
import type { LLMProvider, LLMScoringRequest, LLMScoringResponse, VisionCapableLLMProvider } from '../types'
import {
  LLMRefusalError,
  SCORECARD_SYSTEM_PROMPT,
  SCORING_SYSTEM_PROMPT,
  VISION_PROMPT,
  buildScorecardPrompt,
  buildScoringPrompt,
  normaliseCriteria,
  normaliseScorecard,
} from '../shared'

/** Override with ANTHROPIC_MODEL (for example a cheaper model for bulk screening). */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5'

const ScoringOutput = z.object({
  criteria: z.array(
    z.object({
      criterionId: z.string(),
      met: z.enum(['yes', 'partial', 'no', 'unknown']),
      quote: z.string().nullable(),
      confidence: z.number(),
    }),
  ),
})

const ScorecardOutput = z.object({
  criteria: z.array(
    z.object({ label: z.string(), description: z.string(), weight: z.number(), mustHave: z.boolean() }),
  ),
})

/** The slice of the SDK this provider uses, so tests can supply a stand-in. */
export type AnthropicMessagesClient = Pick<Anthropic, 'messages'>

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

export class AnthropicProvider implements LLMProvider, VisionCapableLLMProvider {
  readonly name = 'anthropic' as const
  readonly supportsVision = true as const

  private readonly client: AnthropicMessagesClient
  private readonly model: string

  constructor(client?: AnthropicMessagesClient) {
    this.model = process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL
    if (client) {
      this.client = client
      return
    }
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
    // Upload routes allow 60s; stay under it so a slow call fails cleanly and can be retried.
    this.client = new Anthropic({ apiKey, timeout: 50_000, maxRetries: 1 })
  }

  async score(request: LLMScoringRequest): Promise<LLMScoringResponse> {
    const message = await this.client.messages.parse({
      model: this.model,
      max_tokens: 16000,
      system: SCORING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildScoringPrompt(request) }],
      output_config: { format: zodOutputFormat(ScoringOutput) },
    })
    if (message.stop_reason === 'refusal') throw new LLMRefusalError()
    if (!message.parsed_output) throw new Error('The AI reader returned an answer in an unexpected format.')

    return {
      criteria: normaliseCriteria(message.parsed_output.criteria, request),
      provider: 'anthropic',
      fromCache: false,
    }
  }

  async extractScorecard(jdText: string): Promise<Omit<ScorecardCriterion, 'id'>[]> {
    const message = await this.client.messages.parse({
      model: this.model,
      max_tokens: 16000,
      system: SCORECARD_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildScorecardPrompt(jdText) }],
      output_config: { format: zodOutputFormat(ScorecardOutput) },
    })
    if (message.stop_reason === 'refusal') throw new LLMRefusalError()
    if (!message.parsed_output) throw new Error('The AI reader returned an answer in an unexpected format.')
    return normaliseScorecard(message.parsed_output.criteria)
  }

  /** Transcribe a scanned CV. PDFs go as `document` blocks; anything else as an image. */
  async extractTextFromImage(base64Data: string, mimeType: string): Promise<string | null> {
    const source =
      mimeType === 'application/pdf'
        ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } } as const)
        : ({ type: 'image', source: { type: 'base64', media_type: mimeType as ImageMediaType, data: base64Data } } as const)

    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 16000,
        messages: [{ role: 'user', content: [source, { type: 'text', text: VISION_PROMPT }] }],
      })
      if (message.stop_reason === 'refusal') return null
      const text = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim()
      return text || null
    } catch {
      return null
    }
  }
}
