/**
 * src/lib/llm/providers/gemini.ts
 *
 * Google Gemini provider stub.
 * Active when LLM_PROVIDER=gemini and GEMINI_API_KEY is set.
 * Uses the Gemini 1.5 Flash model (vision-capable).
 */
import type {
  LLMProvider,
  LLMScoringRequest,
  LLMScoringResponse,
  VisionCapableLLMProvider,
} from '../types'
import type { ScorecardCriterion } from '@/db/types'

const SCORING_PROMPT_PREFIX = `You are a CV assessment assistant. Assess the following CV against each criterion.
Return ONLY a JSON array. For each criterion: { "criterionId": string, "met": "yes"|"partial"|"no"|"unknown", "quote": string|null, "confidence": number }
Rules: quote must be verbatim from the CV; never compute a total score; never reject candidates.

`

const SCORECARD_PROMPT_PREFIX = `Extract a structured scorecard from this job description.
Return ONLY a JSON array: [{ "label": string, "description": string, "weight": number, "mustHave": boolean }]
Weights must sum to 1. Identify 4-8 criteria.

`

export class GeminiProvider implements LLMProvider, VisionCapableLLMProvider {
  readonly name = 'gemini' as const
  readonly supportsVision = true as const

  private apiKey: string
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta'

  constructor() {
    const key = process.env.GEMINI_API_KEY
    if (!key) throw new Error('GEMINI_API_KEY is not set')
    this.apiKey = key
  }

  private async generateContent(
    prompt: string,
    model = 'gemini-1.5-flash',
    parts?: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }>,
  ): Promise<string> {
    const contentParts = parts ?? [{ text: prompt }]

    const response = await fetch(
      `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: contentParts }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
          },
        }),
      },
    )

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${await response.text()}`)
    }

    const data = (await response.json()) as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>
    }

    return data.candidates[0]?.content.parts[0]?.text ?? ''
  }

  async score(request: LLMScoringRequest): Promise<LLMScoringResponse> {
    const criteriaJson = JSON.stringify(
      request.criteria.map((c) => ({ criterionId: c.id, label: c.label, description: c.description })),
    )

    const prompt = `${SCORING_PROMPT_PREFIX}CV TEXT:\n${request.redactedText}\n\nCRITERIA:\n${criteriaJson}`
    const raw = await this.generateContent(prompt)

    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('Gemini response did not contain a JSON array')

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      criterionId: string
      met: string
      quote: string | null
      confidence: number
    }>

    const validMet = new Set(['yes', 'partial', 'no', 'unknown'])

    return {
      criteria: parsed.map((r) => ({
        criterionId: r.criterionId,
        met: validMet.has(r.met) ? (r.met as 'yes' | 'partial' | 'no' | 'unknown') : 'unknown',
        quote: typeof r.quote === 'string' && r.quote.trim() ? r.quote : null,
        confidence: typeof r.confidence === 'number' ? Math.min(1, Math.max(0, r.confidence)) : 0.5,
      })),
      provider: 'gemini',
      fromCache: false,
    }
  }

  async extractScorecard(jdText: string): Promise<Omit<ScorecardCriterion, 'id'>[]> {
    const prompt = `${SCORECARD_PROMPT_PREFIX}JOB DESCRIPTION:\n${jdText}`
    const raw = await this.generateContent(prompt)
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('Gemini scorecard response did not contain JSON')
    return JSON.parse(jsonMatch[0]) as Omit<ScorecardCriterion, 'id'>[]
  }

  async extractTextFromImage(base64Image: string, mimeType: string): Promise<string | null> {
    try {
      const raw = await this.generateContent(
        'Extract all text from this CV/resume image. Return only the extracted text, preserving structure. No commentary.',
        'gemini-1.5-flash',
        [
          { inlineData: { mimeType, data: base64Image } },
          { text: 'Extract all text from this CV/resume image. Return only the extracted text.' },
        ],
      )
      return raw.trim() || null
    } catch {
      return null
    }
  }
}
