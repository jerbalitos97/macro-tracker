import { describe, expect, it, vi } from 'vitest'
import { OPENROUTER_URL, RATE_LIMIT_MESSAGE, VisionError, analyseWithOpenRouter } from './_mealVision.js'

// OpenRouter mockataan fetchin tasolla: testi ei tarvitse avainta eikä verkkoa.

const completion = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const MEAL_JSON = {
  items: [
    { name: 'Kanafilee', grams: 150, kcal: 165, protein_g: 35 },
    { name: 'Riisi', grams: '200', kcal: 260, protein_g: 5 }, // merkkijonoluku hyväksytään
  ],
  total_kcal: 425,
  total_protein_g: 40,
  kcal_range: [480, 380], // väärin päin — normalisoidaan
  confidence: 'medium',
  notes: null,
}

const base = { apiKey: 'test-key', model: 'qwen/qwen2.5-vl-72b-instruct:free', imageDataUrl: 'data:image/jpeg;base64,AAAA' }

describe('analyseWithOpenRouter', () => {
  it('parsii aidatun JSON-vastauksen ja normalisoi sen', async () => {
    const fetch = vi.fn(async () => completion('Tässä arvio:\n```json\n' + JSON.stringify(MEAL_JSON) + '\n```'))

    const r = await analyseWithOpenRouter({ ...base, deps: { fetch: fetch as unknown as typeof globalThis.fetch } })

    expect(r).toEqual({
      description: 'Kanafilee, Riisi',
      items: ['Kanafilee', 'Riisi'],
      components: [
        { name: 'Kanafilee', grams: 150, kcal: 165, protein: 35 },
        { name: 'Riisi', grams: 200, kcal: 260, protein: 5 },
      ],
      calories: 425,
      protein: 40,
      kcalRange: [380, 480],
      confidence: 'medium',
      notes: '',
    })

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(OPENROUTER_URL)
    const sent = JSON.parse(init.body as string)
    expect(sent.model).toBe(base.model)
    expect(sent.messages[1].content[1]).toEqual({ type: 'image_url', image_url: { url: base.imageDataUrl } })
  })

  it('yrittää kerran uudelleen kelvottoman JSONin jälkeen, sitten virhe', async () => {
    const fetch = vi.fn(async () => completion('en osaa sanoa'))
    await expect(
      analyseWithOpenRouter({ ...base, deps: { fetch: fetch as unknown as typeof globalThis.fetch } })
    ).rejects.toMatchObject({ status: 502 })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('429: yksi uusinta viiveellä, sitten "yritä hetken päästä"', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 429, headers: { 'retry-after': '3' } }))
    const sleep = vi.fn(async () => {})

    const err = await analyseWithOpenRouter({
      ...base,
      deps: { fetch: fetch as unknown as typeof globalThis.fetch, sleep },
    }).catch((e) => e)

    expect(err).toBeInstanceOf(VisionError)
    expect(err.status).toBe(429)
    expect(err.message).toBe(RATE_LIMIT_MESSAGE)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(3000)
  })
})
