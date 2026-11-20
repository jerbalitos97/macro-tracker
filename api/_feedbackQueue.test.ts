import { describe, expect, it } from 'vitest'
import { tokenMatches, validatePatch } from './feedback-queue'

const T = 'x'.repeat(40)

describe('feedback-queue auth', () => {
  it('hyväksyy vain oikean Bearer-tokenin', () => {
    expect(tokenMatches(`Bearer ${T}`, T)).toBe(true)
    expect(tokenMatches(`Bearer ${T}y`, T)).toBe(false)
    expect(tokenMatches('', T)).toBe(false)
    expect(tokenMatches(T, T)).toBe(false)
  })
  it('lyhyt tai puuttuva env-token ei avaa mitään', () => {
    expect(tokenMatches('Bearer ', '')).toBe(false)
    expect(tokenMatches('Bearer short', 'short')).toBe(false)
  })
})

describe('feedback-queue patch', () => {
  it('sallii vain triage-kentät', () => {
    expect(validatePatch({ body: 'x' })).toBe('kenttää body ei saa muuttaa')
    expect(validatePatch({ user_id: 'x' })).toBe('kenttää user_id ei saa muuttaa')
    expect(validatePatch({})).toBe('tyhjä päivitys')
    expect(validatePatch([])).toBe('runko ei ole JSON-objekti')
  })
  it('tarkistaa arvot', () => {
    expect(validatePatch({ status: 'deleted' })).toMatch(/tuntematon/)
    expect(validatePatch({ risk: 'medium' })).toMatch(/risk/)
    expect(validatePatch({ priority: 7 })).toMatch(/priority/)
    expect(validatePatch({ plan: 5 })).toMatch(/plan/)
  })
  it('shipped saa aikaleiman', () => {
    const now = new Date('2026-11-20T10:00:00Z')
    expect(validatePatch({ status: 'shipped' }, now)).toEqual({ status: 'shipped', shipped_at: now.toISOString() })
    expect(validatePatch({ status: 'triaged', priority: 2, risk: 'low', plan: 'p' })).toEqual({
      status: 'triaged', priority: 2, risk: 'low', plan: 'p',
    })
  })
})
