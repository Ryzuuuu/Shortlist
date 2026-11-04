/**
 * src/lib/llm/providers/gemini.ts
 *
 * Google Gemini provider. Active when LLM_PROVIDER=gemini and GEMINI_API_KEY is set.
 * Same contract as the Anthropic provider: per-criterion answers only, validated
 * by normaliseCriteria() before anything trusts them.
 *
 * The API key travels in the x-goog-api-key header, never in the URL, so it
 * cannot end up in access logs or proxy logs.
 */
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
  parseJsonLoose,
  unwrapCriteria,
} from '../shared'

/** Override with GEMINI_MODEL. */
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
const REQUEST_TIMEOUT_MS = 50_000

type Part = { text: string } | { inlineData: { mimeType: string; data: string } }

interface GenerateResponse {
  candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>
  promptFeedback?: { blockReason?: string }
}

const SCORING_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      criterionId: { type: 'STRING' },
      met: { type: 'STRING', enum: ['yes', 'partial', 'no', 'unknown'] },
      quote: { type: 'STRING', nullable: true },
      confidence: { type: 'NUMBER' },
    },
    required: ['criterionId', 'met', 'quote', 'confidence'],
  },
}

const SCORECARD_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      label: { type: 'STRING' },
      description: { type: 'STRING' },
      weight: { type: 'NUMBER' },
      mustHave: { type: 'BOOLEAN' },
    },
    required: ['label', 'description', 'weight', 'mustHave'],
  },
}

export class GeminiProvider implements LLMProvider, VisionCapableLLMProvider {
  readonly name = 'gemini' as const
  readonly supportsVision = true as const

  private readonly apiKey: string
  private readonly model: string
  private readonly fetchImpl: typeof fetch

  constructor(fetchImpl: typeof fetch = fetch) {
    const key = process.env.GEMINI_API_KEY
    if (!key) throw new Error('GEMINI_API_KEY is not set')
    this.apiKey = key
    this.model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL
    this.fetchImpl = fetchImpl
  }

  private async generate(system: string, parts: Part[], responseSchema?: object): Promise<string> {
    const response = await this.fetchImpl(`${BASE_URL}/models/${this.model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 8192,
          ...(responseSchema ? { responseMimeType: 'application/json', responseSchema } : {}),
        },
      }),
    })

    if (!response.ok) {
      // Status only: the body can echo request content, which is personal data.
      throw new Error(`Gemini API error: ${response.status}`)
    }

    const data = (await response.json()) as GenerateResponse
    if (data.promptFeedback?.blockReason) throw new LLMRefusalError()
    const candidate = data.candidates?.[0]
    if (candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'PROHIBITED_CONTENT') throw new LLMRefusalError()
    return (candidate?.content?.parts ?? []).map((p) => p.text ?? '').join('')
  }

  async score(request: LLMScoringRequest): Promise<LLMScoringResponse> {
    const text = await this.generate(SCORING_SYSTEM_PROMPT, [{ text: buildScoringPrompt(request) }], SCORING_SCHEMA)
    return {
      criteria: normaliseCriteria(unwrapCriteria(parseJsonLoose(text)), request),
      provider: 'gemini',
      fromCache: false,
    }
  }

  async extractScorecard(jdText: string): Promise<Omit<ScorecardCriterion, 'id'>[]> {
    const text = await this.generate(SCORECARD_SYSTEM_PROMPT, [{ text: buildScorecardPrompt(jdText) }], SCORECARD_SCHEMA)
    return normaliseScorecard(unwrapCriteria(parseJsonLoose(text)))
  }

  /** Transcribe a scanned CV (PDF or image bytes, base64). */
  async extractTextFromImage(base64Data: string, mimeType: string): Promise<string | null> {
    try {
      const text = await this.generate('You transcribe documents faithfully.', [
        { inlineData: { mimeType, data: base64Data } },
        { text: VISION_PROMPT },
      ])
      return text.trim() || null
    } catch {
      return null
    }
  }
}
