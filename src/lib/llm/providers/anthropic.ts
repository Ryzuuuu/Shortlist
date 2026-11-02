/**
 * src/lib/llm/providers/anthropic.ts
 *
 * Anthropic Claude provider stub.
 * Active when LLM_PROVIDER=anthropic and ANTHROPIC_API_KEY is set.
 *
 * The LLM is instructed to return ONLY per-criterion assessments —
 * never a total score (AI Rule #1).
 *
 * System prompt enforces:
 *   - Return JSON only, no prose
 *   - quote must be an exact substring of the provided text
 *   - Never reject a candidate; only assess evidence
 */
import type {
  LLMProvider,
  LLMScoringRequest,
  LLMScoringResponse,
  VisionCapableLLMProvider,
} from '../types'
import type { ScorecardCriterion } from '@/db/types'

const SCORING_SYSTEM_PROMPT = `You are a CV assessment assistant for a staffing firm.
You will receive a redacted CV text and a list of scorecard criteria.
For each criterion, return a JSON assessment.

Rules (MUST follow):
1. Return ONLY a JSON array — no prose, no markdown, no explanation.
2. For each criterion return: { "criterionId": string, "met": "yes"|"partial"|"no"|"unknown", "quote": string|null, "confidence": number }
3. "quote" MUST be an exact substring copied verbatim from the CV text provided. If no evidence, set quote to null.
4. "confidence" is a float 0–1 reflecting your certainty.
5. "met" values: "yes" = clear evidence, "partial" = some evidence, "no" = contradicting or absent evidence, "unknown" = cannot determine from text.
6. NEVER reject a candidate. Only assess what the text says.
7. Do NOT compute a total score. Only assess each criterion independently.`

const SCORECARD_SYSTEM_PROMPT = `You are a recruitment expert. Extract a structured scorecard from a job description.
Return ONLY a JSON array of criteria objects with fields:
{ "label": string, "description": string, "weight": number (0-1), "mustHave": boolean }
Weights must sum to 1. Identify 4-8 criteria. Return JSON only, no prose.`

export class AnthropicProvider implements LLMProvider, VisionCapableLLMProvider {
  readonly name = 'anthropic' as const
  readonly supportsVision = true as const

  private apiKey: string

  constructor() {
    const key = process.env.ANTHROPIC_API_KEY
    if (!key) throw new Error('ANTHROPIC_API_KEY is not set')
    this.apiKey = key
  }

  private async callClaude(
    systemPrompt: string,
    userMessage: string,
    model = 'claude-3-5-haiku-20241022',
  ): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${await response.text()}`)
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>
    }

    const textBlock = data.content.find((b) => b.type === 'text')
    if (!textBlock) throw new Error('No text block in Anthropic response')
    return textBlock.text
  }

  async score(request: LLMScoringRequest): Promise<LLMScoringResponse> {
    const criteriaJson = JSON.stringify(
      request.criteria.map((c) => ({ criterionId: c.id, label: c.label, description: c.description })),
      null,
      2,
    )

    const userMessage = `CV TEXT:\n${request.redactedText}\n\nCRITERIA:\n${criteriaJson}`

    const raw = await this.callClaude(SCORING_SYSTEM_PROMPT, userMessage)

    // Parse response — extract JSON array even if wrapped in markdown
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('Anthropic response did not contain a JSON array')

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
      provider: 'anthropic',
      fromCache: false,
    }
  }

  async extractScorecard(jdText: string): Promise<Omit<ScorecardCriterion, 'id'>[]> {
    const raw = await this.callClaude(SCORECARD_SYSTEM_PROMPT, `JOB DESCRIPTION:\n${jdText}`)
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('Anthropic scorecard response did not contain JSON')
    return JSON.parse(jsonMatch[0]) as Omit<ScorecardCriterion, 'id'>[]
  }

  async extractTextFromImage(base64Image: string, mimeType: string): Promise<string | null> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 8192,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mimeType, data: base64Image },
              },
              {
                type: 'text',
                text: 'Extract all text from this CV/resume image. Return only the extracted text, preserving structure. No commentary.',
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) return null

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>
    }
    return data.content.find((b) => b.type === 'text')?.text ?? null
  }
}
