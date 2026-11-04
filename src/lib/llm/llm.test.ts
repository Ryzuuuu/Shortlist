// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScorecardCriterion } from '@/db/types'
import { AnthropicProvider, DEFAULT_ANTHROPIC_MODEL, type AnthropicMessagesClient } from './providers/anthropic'
import { DEFAULT_GEMINI_MODEL, GeminiProvider } from './providers/gemini'
import { LLMRefusalError, buildScoringPrompt, normaliseCriteria, normaliseScorecard, parseJsonLoose, unwrapCriteria } from './shared'
import type { LLMScoringRequest } from './types'

const criteria: ScorecardCriterion[] = [
  { id: 'c-java', label: 'Java', description: 'Java development', weight: 0.5, mustHave: true },
  { id: 'c-spring', label: 'Spring Boot', description: 'Spring Boot services', weight: 0.5, mustHave: false },
]
const request: LLMScoringRequest = {
  redactedText: 'Built Spring Boot services in Java for 6 years.',
  criteria,
  cacheKey: 'h:1',
}

describe('normaliseCriteria', () => {
  it('keeps valid answers and clamps confidence', () => {
    const out = normaliseCriteria(
      [{ criterionId: 'c-java', met: 'yes', quote: ' Java for 6 years ', confidence: 7 }],
      request,
    )
    expect(out).toEqual([{ criterionId: 'c-java', met: 'yes', quote: 'Java for 6 years', confidence: 1 }])
  })

  it('drops criteria that were never asked about, and repeats', () => {
    const out = normaliseCriteria(
      [
        { criterionId: 'made-up', met: 'yes', quote: 'x', confidence: 1 },
        { criterionId: 'c-java', met: 'yes', quote: 'a', confidence: 0.9 },
        { criterionId: 'c-java', met: 'no', quote: 'b', confidence: 0.1 },
      ],
      request,
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ criterionId: 'c-java', met: 'yes', quote: 'a' })
  })

  it('degrades malformed values to the safe reading instead of throwing', () => {
    const out = normaliseCriteria([{ criterionId: 'c-java', met: 'definitely', quote: '   ', confidence: 'high' }], request)
    expect(out[0]).toEqual({ criterionId: 'c-java', met: 'unknown', quote: null, confidence: 0.5 })
  })

  it('rejects an answer that is not a list, and truncates very long quotes', () => {
    expect(() => normaliseCriteria({ nope: true }, request)).toThrow()
    const out = normaliseCriteria([{ criterionId: 'c-java', met: 'yes', quote: 'q'.repeat(5000), confidence: 1 }], request)
    expect(out[0]?.quote).toHaveLength(600)
  })
})

describe('normaliseScorecard / parseJsonLoose', () => {
  it('cleans a proposed scorecard and refuses an empty one', () => {
    const out = normaliseScorecard([
      { label: ' Java ', description: 'x', weight: 0.6, mustHave: true },
      { label: '', description: 'no label' },
      { label: 'SQL', description: 3, weight: -1, mustHave: 'yes' },
    ])
    expect(out).toEqual([
      { label: 'Java', description: 'x', weight: 0.6, mustHave: true },
      { label: 'SQL', description: '', weight: 0, mustHave: false },
    ])
    expect(() => normaliseScorecard([])).toThrow()
  })

  it('reads JSON wrapped in prose or code fences, and unwraps {criteria}', () => {
    const v = parseJsonLoose('Sure!\n```json\n{"criteria":[{"a":1}]}\n```')
    expect(unwrapCriteria(v)).toEqual([{ a: 1 }])
    expect(unwrapCriteria([1])).toEqual([1])
    expect(() => parseJsonLoose('no json here')).toThrow()
  })
})

describe('prompt construction', () => {
  it('puts the CV inside tags and the criteria as data', () => {
    const p = buildScoringPrompt(request)
    expect(p).toContain('<cv>\nBuilt Spring Boot services')
    expect(p).toContain('"criterionId": "c-java"')
    expect(p).not.toContain('"weight"') // weights are never shown to the model
  })
})

describe('AnthropicProvider', () => {
  const originalModel = process.env.ANTHROPIC_MODEL
  beforeEach(() => {
    delete process.env.ANTHROPIC_MODEL
  })
  afterEach(() => {
    if (originalModel === undefined) delete process.env.ANTHROPIC_MODEL
    else process.env.ANTHROPIC_MODEL = originalModel
  })

  const fake = (parse: unknown, create?: unknown) =>
    ({ messages: { parse, create: create ?? vi.fn() } }) as unknown as AnthropicMessagesClient

  it('asks for per-criterion answers only, with the CV as data, on the default model', async () => {
    const parse = vi.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      parsed_output: {
        criteria: [
          { criterionId: 'c-java', met: 'yes', quote: 'Java for 6 years', confidence: 0.9 },
          { criterionId: 'ghost', met: 'yes', quote: 'x', confidence: 1 },
        ],
      },
    })
    const out = await new AnthropicProvider(fake(parse)).score(request)

    const args = parse.mock.calls[0]?.[0]
    expect(args.model).toBe(DEFAULT_ANTHROPIC_MODEL)
    expect(args.system).toMatch(/untrusted data/i)
    expect(args.system).toMatch(/do not calculate a total score/i)
    expect(args.messages[0].content).toContain('<cv>')
    expect(args.output_config.format).toBeDefined()
    expect(args).not.toHaveProperty('temperature') // sampling parameters are rejected by this model family
    expect(out.provider).toBe('anthropic')
    expect(out.criteria.map((c) => c.criterionId)).toEqual(['c-java']) // made-up id dropped
  })

  it('honours ANTHROPIC_MODEL', async () => {
    process.env.ANTHROPIC_MODEL = 'claude-haiku-5-5'
    const parse = vi.fn().mockResolvedValue({ stop_reason: 'end_turn', parsed_output: { criteria: [] } })
    await new AnthropicProvider(fake(parse)).score(request)
    expect(parse.mock.calls[0]?.[0].model).toBe('claude-haiku-5-5')
  })

  it('turns a refusal or an unparsable answer into errors the pipeline can route', async () => {
    const refused = new AnthropicProvider(fake(vi.fn().mockResolvedValue({ stop_reason: 'refusal', parsed_output: null })))
    await expect(refused.score(request)).rejects.toBeInstanceOf(LLMRefusalError)
    const bad = new AnthropicProvider(fake(vi.fn().mockResolvedValue({ stop_reason: 'end_turn', parsed_output: null })))
    await expect(bad.score(request)).rejects.toThrow(/unexpected format/)
  })

  it('extracts a scorecard through the same validation', async () => {
    const parse = vi.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      parsed_output: { criteria: [{ label: 'Java', description: 'Java', weight: 1, mustHave: true }] },
    })
    const out = await new AnthropicProvider(fake(parse)).extractScorecard('Senior Java Developer')
    expect(out).toEqual([{ label: 'Java', description: 'Java', weight: 1, mustHave: true }])
    expect(parse.mock.calls[0]?.[0].messages[0].content).toContain('<jd>')
  })

  it('sends scanned PDFs as document blocks and images as image blocks', async () => {
    const create = vi.fn().mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: ' Jane Doe\nJava ' }] })
    const p = new AnthropicProvider(fake(vi.fn(), create))

    expect(await p.extractTextFromImage('QUJD', 'application/pdf')).toBe('Jane Doe\nJava')
    expect(create.mock.calls[0]?.[0].messages[0].content[0]).toEqual({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: 'QUJD' },
    })

    await p.extractTextFromImage('QUJD', 'image/png')
    expect(create.mock.calls[1]?.[0].messages[0].content[0].type).toBe('image')
  })

  it('returns null (so the CV goes to Needs review) on refusal or API failure', async () => {
    const refused = new AnthropicProvider(fake(vi.fn(), vi.fn().mockResolvedValue({ stop_reason: 'refusal', content: [] })))
    expect(await refused.extractTextFromImage('QUJD', 'application/pdf')).toBeNull()
    const failing = new AnthropicProvider(fake(vi.fn(), vi.fn().mockRejectedValue(new Error('boom'))))
    expect(await failing.extractTextFromImage('QUJD', 'application/pdf')).toBeNull()
  })

  it('refuses to start without a key when not given a client', () => {
    const saved = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    expect(() => new AnthropicProvider()).toThrow(/ANTHROPIC_API_KEY/)
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved
  })
})

describe('GeminiProvider', () => {
  const saved = { key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL }
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key-not-real'
    delete process.env.GEMINI_MODEL
  })
  afterEach(() => {
    if (saved.key === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = saved.key
    if (saved.model !== undefined) process.env.GEMINI_MODEL = saved.model
  })

  const reply = (body: unknown, ok = true, status = 200) =>
    vi.fn().mockResolvedValue({ ok, status, json: async () => body, text: async () => 'SECRET BODY' })
  const text = (t: string) => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: t }] } }] })

  it('keeps the API key out of the URL and sends it as a header', async () => {
    const f = reply(text('[{"criterionId":"c-java","met":"yes","quote":"Java for 6 years","confidence":0.8}]'))
    const out = await new GeminiProvider(f as unknown as typeof fetch).score(request)

    const [url, init] = f.mock.calls[0] as [string, RequestInit]
    expect(url).not.toContain('key=')
    expect(url).not.toContain('test-key-not-real')
    expect(url).toContain(`/models/${DEFAULT_GEMINI_MODEL}:generateContent`)
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key-not-real')
    const body = JSON.parse(init.body as string)
    expect(body.systemInstruction.parts[0].text).toMatch(/untrusted data/i)
    expect(body.generationConfig.responseMimeType).toBe('application/json')
    expect(out.criteria).toEqual([{ criterionId: 'c-java', met: 'yes', quote: 'Java for 6 years', confidence: 0.8 }])
  })

  it('accepts {criteria: [...]} wrapping and drops unknown criteria', async () => {
    const f = reply(text('{"criteria":[{"criterionId":"nope","met":"yes","quote":"x","confidence":1}]}'))
    const out = await new GeminiProvider(f as unknown as typeof fetch).score(request)
    expect(out.criteria).toEqual([])
  })

  it('routes a safety block to the refusal path and never leaks the error body', async () => {
    const blocked = reply({ promptFeedback: { blockReason: 'SAFETY' } })
    await expect(new GeminiProvider(blocked as unknown as typeof fetch).score(request)).rejects.toBeInstanceOf(LLMRefusalError)

    const failing = reply({}, false, 500)
    const err = await new GeminiProvider(failing as unknown as typeof fetch).score(request).catch((e: Error) => e)
    expect((err as Error).message).toBe('Gemini API error: 500')
    expect((err as Error).message).not.toContain('SECRET BODY')
  })

  it('transcribes scanned PDFs inline and returns null on failure', async () => {
    const f = reply(text(' Scanned text '))
    const p = new GeminiProvider(f as unknown as typeof fetch)
    expect(await p.extractTextFromImage('QUJD', 'application/pdf')).toBe('Scanned text')
    const body = JSON.parse((f.mock.calls[0] as [string, RequestInit])[1].body as string)
    expect(body.contents[0].parts[0].inlineData).toEqual({ mimeType: 'application/pdf', data: 'QUJD' })

    const failing = new GeminiProvider(reply({}, false, 503) as unknown as typeof fetch)
    expect(await failing.extractTextFromImage('QUJD', 'application/pdf')).toBeNull()
  })

  it('refuses to start without a key', () => {
    delete process.env.GEMINI_API_KEY
    expect(() => new GeminiProvider()).toThrow(/GEMINI_API_KEY/)
  })
})
