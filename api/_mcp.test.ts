// MCP:n kaksi lupausta, kumpikin testattuna sieltä mistä se voi hiljaa pettää.
//
// 1. Luvut ovat samat kuin sovelluksessa. `api/mcp.ts` peilaa budjetti- ja
//    jaksolaskennan eikä tuo sitä `src/lib`istä, joten peili voi ajautua
//    erilleen ilman että mikään kaatuu — vastaus chatissa olisi vain eri kuin
//    ruudulla. Pariteettitesti ajaa molemmat samalla datalla.
// 2. Kirjoitus on kaksivaiheinen, sidottu näytettyyn sisältöön ja peruttavissa.

import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
const db = vi.hoisted(() => {
  process.env.SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service'
  process.env.MCP_USER_ID = 'me'
  process.env.MCP_API_KEY = 'k'.repeat(64)
  return { tables: {} as Record<string, Record<string, unknown>[]>, seq: 0 }
})

// Pieni muistinvarainen PostgREST: juuri ne ketjut joita mcp.ts käyttää.
vi.mock('@supabase/supabase-js', () => {
  const keyOf = (t: string) => (t === 'settings' ? 'user_id' : 'id')
  class Q {
    private filters: ((r: Row) => boolean)[] = []
    private op: 'select' | 'update' | 'delete' = 'select'
    private patch: Row = {}
    private single = false
    private done: { data: unknown; error: null } | null = null
    constructor(private t: string) { db.tables[t] ??= [] }
    select() { return this }
    order() { return this }
    limit() { return this }
    eq(k: string, v: unknown) { this.filters.push((r) => r[k] === v); return this }
    gte(k: string, v: string) { this.filters.push((r) => String(r[k]) >= v); return this }
    maybeSingle() { this.single = true; return this }
    update(p: Row) { this.op = 'update'; this.patch = p; return this }
    delete() { this.op = 'delete'; return this }
    upsert(row: Row) {
      const k = keyOf(this.t)
      db.tables[this.t] = [...db.tables[this.t].filter((r) => r[k] !== row[k]), { ...row }]
      this.done = { data: null, error: null }
      return this
    }
    insert(row: Row) {
      const withId = { id: ++db.seq, at: new Date().toISOString(), undone_at: null, ...row }
      db.tables[this.t].push(withId)
      this.done = { data: withId, error: null }
      return this
    }
    then<T>(res: (v: { data: unknown; error: null }) => T) {
      if (this.done) return Promise.resolve(res(this.done))
      const hit = db.tables[this.t].filter((r) => this.filters.every((f) => f(r)))
      if (this.op === 'update') hit.forEach((r) => Object.assign(r, this.patch))
      if (this.op === 'delete') db.tables[this.t] = db.tables[this.t].filter((r) => !hit.includes(r))
      return Promise.resolve(res({ data: this.single ? (hit[0] ?? null) : hit, error: null }))
    }
  }
  return { createClient: () => ({ from: (t: string) => new Q(t) }) }
})

import handler, {
  TOOL_LIST, WRITE_TOOLS, computeDay, cumulativeFor, dispatch, getActivePeriod,
  keyMatches, todayISO, validateGoalPeriod,
  type AllData, type Settings,
} from './mcp.js'
import { computeDays } from '../src/lib/compute'
import { getActivePeriod as appActivePeriod } from '../src/lib/goalPeriods'
import type { Settings as AppSettings } from '../src/types'

const TODAY = '2026-11-13'

const settings: Settings = {
  // Jäädytetyt vanhat kentät osoittavat tarkoituksella aivan muualle: jos
  // jokin lukee niitä, luvut eivät täsmää.
  startDate: '2025-01-01', endDate: '2025-03-01', startWeight: 95, targetWeight: 80,
  tdee: { rest: 2400, single: 2800, double: 3200, volleyball: 3000 },
  weeklyPattern: { 0: 'rest', 1: 'single', 2: 'double', 3: 'single', 4: 'volleyball', 5: 'single', 6: 'rest' },
  proteinTarget: 180,
  goalPeriods: [
    { id: 1, type: 'cut', status: 'achieved', startDate: '2026-08-01', endDate: '2026-10-18', startWeight: 88, targetWeight: 84, createdAt: 'x' },
    {
      id: 2, type: 'cut', status: 'active', startDate: '2026-10-19', endDate: '2026-12-13',
      startWeight: 84, targetWeight: 81, weekendMaintenance: true, tdeeByDow: { 2: 3350 }, createdAt: 'x',
    },
    { id: 3, type: 'maintenance', status: 'planned', startDate: '2026-12-14', endDate: '2027-01-31', startWeight: 81, targetWeight: 81, createdAt: 'x' },
  ],
}

const data: AllData = {
  settings,
  meals: [
    { id: 1, date: '2026-10-20', kcal: 2100, protein: 170 },
    { id: 2, date: '2026-10-24', kcal: 2900, protein: 150 },
    { id: 3, date: '2026-11-03', kcal: 300, protein: 20 },
    { id: 4, date: '2026-11-12', kcal: 2500, protein: 190 },
    { id: 5, date: TODAY, kcal: 800, protein: 60 },
  ],
  weights: [],
  burns: [
    { id: 1, date: '2026-10-20', kcal: 400, note: '' },
    { id: 2, date: '2026-11-03', kcal: 650, note: '' }, // enemmän kuin syöty
  ],
  events: [
    { id: 1, date: '2026-11-07', name: 'Juhla', excessKcal: 1200, bufferDays: 4, bufferDirection: 'both' },
    { id: 2, date: '2026-11-07', name: 'Toinen', excessKcal: 300, bufferDays: 0, bufferDirection: 'before' },
    { id: 3, date: '2026-11-20', name: 'Illallinen', excessKcal: 900, bufferDays: 3, bufferDirection: 'before' },
  ],
  extras: [{ id: 1, date: '2026-11-12', kcal: 250, note: '' }],
  adjustments: [{ id: 1, date: '2026-11-11', kcal: -150, note: '' }],
}

describe('luvut ovat samat kuin sovelluksessa', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(`${TODAY}T10:00:00Z`))
  })

  it('voimassa oleva jakso on sama', () => {
    const app = appActivePeriod(settings as AppSettings, TODAY)
    expect(getActivePeriod(settings, TODAY).id).toBe(app?.id)
    expect(getActivePeriod(settings, TODAY).id).toBe(2)
  })

  it('jokainen jakson päivä: budjetti, TDEE, suunniteltu ja toteutunut vaje', () => {
    const app = computeDays(settings as AppSettings, data.events, data.extras, data.meals, data.burns, data.adjustments)
    expect(app.days.length).toBe(56)
    for (const d of app.days) {
      const m = computeDay(d.date, data, TODAY)
      expect(m, d.date).not.toBeNull()
      expect({
        date: d.date, budget: m!.budget, baseTdee: m!.baseTdee, plan: m!.dailyDeficitBase,
        buffer: m!.preBufferReduction, actual: m!.actualDeficit ?? undefined,
      }).toEqual({
        date: d.date, budget: d.budget, baseTdee: d.baseTdee, plan: d.dailyDeficitBase,
        buffer: d.preBufferReduction, actual: d.actualDeficit,
      })
    }
  })

  it('kertynyt vaje ja odotus', () => {
    const app = computeDays(settings as AppSettings, data.events, data.extras, data.meals, data.burns, data.adjustments)
    const m = cumulativeFor(data, TODAY)
    expect(m.cumulativeDeficit).toBe(app.cumulativeDeficit)
    expect(m.elapsedDays).toBe(app.elapsedDays)
    expect(m.expectedDeficit).toBeCloseTo(app.expectedDeficit, 6)
    expect(m.dailyDeficitBase).toBeCloseTo(app.dailyDeficitBase, 6)
  })

  it('ilman jaksoja vanhat kentät toimivat yhä', () => {
    const legacy = { ...settings, goalPeriods: undefined, startDate: '2026-10-01', endDate: '2026-12-31' }
    const app = computeDays(legacy as AppSettings, [], [], data.meals, [], [])
    const d = app.days.find((x) => x.date === '2026-11-12')!
    expect(computeDay('2026-11-12', { ...data, settings: legacy, events: [], extras: [], burns: [], adjustments: [] }, TODAY)!.budget).toBe(d.budget)
  })

  it('aiemman jakson päivä arvioidaan sen omalla suunnitelmalla', () => {
    const d = computeDay('2026-09-01', data, TODAY)!
    expect(d.period).toMatchObject({ id: 1, inForceToday: false })
    expect(d.dailyDeficitBase).toBe(Math.round((4 * 7700) / 79))
  })

  it('"tänään" on Suomen päivä eikä palvelimen', () => {
    expect(todayISO(new Date('2026-11-13T22:30:00Z'))).toBe('2026-11-14')
    expect(todayISO(new Date('2026-06-30T21:30:00Z'))).toBe('2026-07-01')
  })
})

describe('kirjoitus', () => {
  const call = (name: string, args: Row) => dispatch(name, args) as Promise<Row>
  const template = () => ({
    id: 'tpl-new', name: 'Veto A', kind: 'strength', exercises: [],
  })

  beforeEach(() => {
    vi.useRealTimers()
    db.seq = 0
    db.tables = {
      settings: [{ user_id: 'me', data: structuredClone(settings), updated_at: '2026-11-01T00:00:00Z' }],
      workout_templates: [], workout_warmups: [], workout_blocks: [], workout_locations: [], mcp_writes: [],
    }
  })

  it('ensimmäinen kutsu ei kirjoita, toinen kirjoittaa ja lokittaa', async () => {
    const dry = await call('put_workout_template', { template: template() })
    expect(dry).toMatchObject({ wrote: false, dryRun: true })
    expect(db.tables.workout_templates).toHaveLength(0)

    // Uuden rivin luontihetki on eri näillä kahdella kutsulla. Kun se oli
    // mukana tunnuksessa, uutta pohjaa ei voinut vahvistaa koskaan.
    await new Promise((r) => setTimeout(r, 5))
    const done = await call('put_workout_template', { template: template(), confirm: dry.confirmToken })
    expect(done).toMatchObject({ wrote: true })
    expect(db.tables.workout_templates).toHaveLength(1)
    expect(db.tables.mcp_writes[0]).toMatchObject({ tool: 'put_workout_template', before: null })
  })

  it('tunnus ei vahvista eri sisältöä kuin mikä näytettiin', async () => {
    const dry = await call('put_workout_template', { template: template() })
    const other = await call('put_workout_template', { template: { ...template(), name: 'Jotain muuta' }, confirm: dry.confirmToken })
    expect(other).toMatchObject({ wrote: false, dryRun: true })
    expect(db.tables.workout_templates).toHaveLength(0)
  })

  it('sama sisältö kahdesti on yksi kirjoitus', async () => {
    const dry = await call('put_workout_template', { template: template() })
    await call('put_workout_template', { template: template(), confirm: dry.confirmToken })
    expect(await call('put_workout_template', { template: template() })).toMatchObject({ wrote: false, unchanged: true })
    expect(db.tables.mcp_writes).toHaveLength(1)
  })

  it('treenipaikka: luonti, varoitus kadonneesta ominaisuudesta, peruutus', async () => {
    const loc = { id: 'koti', name: 'Koti', capabilities: ['trapBar', 'externalLoad'] }
    const dry = await call('put_training_location', { location: loc })
    await call('put_training_location', { location: loc, confirm: dry.confirmToken })
    expect(db.tables.workout_locations[0]).toMatchObject({ has_trap_bar: true, has_external_load: true, has_plyo_box: false, user_id: 'me' })

    const less = { ...loc, capabilities: ['externalLoad'] }
    const dry2 = await call('put_training_location', { location: less })
    expect(String(dry2.warning)).toContain('trapBar')
    const done2 = await call('put_training_location', { location: less, confirm: dry2.confirmToken })
    expect(db.tables.workout_locations[0]).toMatchObject({ has_trap_bar: false })

    const undoDry = await call('undo_write', { writeId: done2.writeId })
    await call('undo_write', { writeId: done2.writeId, confirm: undoDry.confirmToken })
    expect(db.tables.workout_locations[0]).toMatchObject({ has_trap_bar: true })

    expect(await call('put_training_location', { location: { ...loc, capabilities: ['sauna'] } })).toMatchObject({ ok: false, wrote: false })
  })

  describe('tavoitejakso', () => {
    const next = {
      type: 'bulk', status: 'planned', startDate: '2027-02-01', endDate: '2027-04-30',
      startWeight: 81, targetWeight: 83, label: 'Kevään nousu',
    }
    const stored = () => (db.tables.settings[0].data as Settings)

    it('lisää jakson koskematta muihin asetuksiin', async () => {
      const dry = await call('put_goal_period', { period: next })
      expect(dry).toMatchObject({ wrote: false, dryRun: true, inForceTodayAfterWrite: { id: 2 } })
      expect(stored().goalPeriods).toHaveLength(3)

      await call('put_goal_period', { period: next, confirm: dry.confirmToken })
      expect(stored().goalPeriods).toHaveLength(4)
      expect(stored().goalPeriods![3]).toMatchObject({ id: 4, type: 'bulk', status: 'planned' })
      expect(stored().tdee).toEqual(settings.tdee)
      expect(stored().proteinTarget).toBe(180)
    })

    it('ei kirjoita jos puhelin tallensi asetukset väliin', async () => {
      const dry = await call('put_goal_period', { period: next })
      // Puhelin muuttaa TDEE:tä vahvistuksen lukemisen ja kirjoituksen välissä.
      const row = db.tables.settings[0]
      let reads = 0
      Object.defineProperty(row, 'updated_at', {
        get: () => (reads++ === 0 ? '2026-11-01T00:00:00Z' : '2026-11-13T09:00:00Z'),
        set: () => {},
        configurable: true,
        enumerable: true,
      })
      const res = await call('put_goal_period', { period: next, confirm: dry.confirmToken })
      expect(res).toMatchObject({ ok: false, wrote: false })
      expect(stored().goalPeriods).toHaveLength(3)
      expect(db.tables.mcp_writes).toHaveLength(0)
    })

    it('peruutus palauttaa jaksolistan mutta ei pyyhi sillä välin muutettua TDEE:tä', async () => {
      const dry = await call('put_goal_period', { period: next })
      const done = await call('put_goal_period', { period: next, confirm: dry.confirmToken })
      stored().tdee.rest = 2500

      const undoDry = await call('undo_write', { writeId: done.writeId })
      await call('undo_write', { writeId: done.writeId, confirm: undoDry.confirmToken })
      expect(stored().goalPeriods).toHaveLength(3)
      expect(stored().tdee.rest).toBe(2500)
    })

    it('tuleva jakso ei voi olla active', async () => {
      const res = await call('put_goal_period', { period: { ...next, status: 'active' } })
      expect(res).toMatchObject({ ok: false, wrote: false })
      expect(validateGoalPeriod({ ...next, status: 'active' }, TODAY).join(' ')).toContain('planned')
    })

    it('varoittaa jyrkästä tahdista ja päällekkäisyydestä mutta ei estä', async () => {
      const steep = { type: 'cut', status: 'planned', startDate: '2026-12-01', endDate: '2026-12-21', startWeight: 84, targetWeight: 80 }
      const dry = await call('put_goal_period', { period: steep })
      expect(dry.dryRun).toBe(true)
      const w = (dry.warnings as string[]).join(' ')
      expect(w).toContain('Jyrkkä tahti')
      expect(w).toContain('päällekkäin')
    })

    it('hylkää tuntemattomat kentät ja mahdottomat arvot', () => {
      expect(validateGoalPeriod({ ...next, kcal: 1 }, TODAY)).toHaveLength(1)
      expect(validateGoalPeriod({ ...next, targetWeight: 8 }, TODAY).length).toBeGreaterThan(0)
      expect(validateGoalPeriod({ ...next, type: 'cut' }, TODAY).join(' ')).toContain('cut')
      expect(validateGoalPeriod({ ...next, tdeeByDow: { 7: 3000 } }, TODAY).length).toBeGreaterThan(0)
    })

    it('ensimmäinen kirjoitus tekee vanhoista kentistä jakson eikä hukkaa sitä', async () => {
      delete (db.tables.settings[0].data as Settings).goalPeriods
      const dry = await call('put_goal_period', { period: next })
      await call('put_goal_period', { period: next, confirm: dry.confirmToken })
      expect(stored().goalPeriods!.map((p) => p.id)).toEqual([1, 2])
      expect(stored().goalPeriods![0]).toMatchObject({ startDate: '2025-01-01', type: 'cut' })
    })
  })
})

describe('rajat', () => {
  it('kirjanpitoon ei ole yhtään kirjoittavaa työkalua', () => {
    const names = TOOL_LIST.map((t) => t.name)
    for (const w of WRITE_TOOLS) expect(names).toContain(w)
    for (const t of TOOL_LIST) {
      expect(t.annotations.readOnlyHint, t.name).toBe(!WRITE_TOOLS.includes(t.name))
      // Kirjoittava työkalu ottaa aina vahvistustunnuksen.
      if (WRITE_TOOLS.includes(t.name)) expect(Object.keys(t.inputSchema.properties), t.name).toContain('confirm')
    }
    expect(names.filter((n) => /meal|weight|habit|mobility|burn/.test(n) && WRITE_TOOLS.includes(n))).toEqual([])
  })

  it('avain: vain täsmälleen oikea Bearer kelpaa', () => {
    const key = 'a'.repeat(64)
    expect(keyMatches(`Bearer ${key}`, key)).toBe(true)
    expect(keyMatches(`bearer ${key}`, key)).toBe(true)
    expect(keyMatches(key, key)).toBe(false)
    expect(keyMatches(`Bearer ${key}x`, key)).toBe(false)
    expect(keyMatches('Bearer ', '')).toBe(false)
    expect(keyMatches('Bearer short', 'short')).toBe(false)
  })
})

// Sama polku jota Claude kulkee: HTTP-pyyntö sisään, JSON-RPC ulos.
describe('yhteys päästä päähän', () => {
  const KEY = 'k'.repeat(64)
  const post = async (body: unknown, auth: string | null = `Bearer ${KEY}`) => {
    const out: { status: number; body: unknown; headers: Record<string, string> } = { status: 0, body: undefined, headers: {} }
    const res = {
      status(c: number) { out.status = c; return res },
      setHeader(k: string, v: string) { out.headers[k] = v },
      json(b: unknown) { out.body = b },
      end() {},
    }
    await handler({ method: 'POST', headers: auth ? { authorization: auth } : {}, body }, res)
    return out
  }
  const rpc = (method: string, params?: Row) => ({ jsonrpc: '2.0' as const, id: 1, method, params })
  const toolResult = (r: { body: unknown }) =>
    JSON.parse((((r.body as Row).result as Row).content as { text: string }[])[0].text) as Row

  beforeEach(() => {
    vi.useRealTimers()
    db.seq = 0
    db.tables = {
      settings: [{ user_id: 'me', data: structuredClone(settings), updated_at: '2026-11-01T00:00:00Z' }],
      meals: [{ id: 1, user_id: 'me', date: '2026-11-12', kcal: 2500, protein: 190 }, { id: 2, user_id: 'someone-else', date: '2026-11-12', kcal: 9999, protein: 1 }],
      weight_entries: [], training_burns: [], special_events: [], extra_workouts: [], daily_adjustments: [],
      workout_templates: [], workout_warmups: [], workout_blocks: [], workout_locations: [], mcp_writes: [],
    }
  })

  it('ilman avainta tai väärällä avaimella ei pääse mihinkään', async () => {
    expect((await post(rpc('tools/list'), null)).status).toBe(401)
    expect((await post(rpc('tools/list'), 'Bearer nope')).status).toBe(401)
    expect((await post(rpc('tools/call', { name: 'put_goal_period', arguments: {} }), 'Bearer nope')).status).toBe(401)
  })

  it('kättely, työkalulista ja luku', async () => {
    const init = await post(rpc('initialize'))
    expect(((init.body as Row).result as Row).instructions).toContain('two calls')

    const list = (((await post(rpc('tools/list'))).body as Row).result as Row).tools as Row[]
    expect(list.map((t) => t.name)).toEqual(expect.arrayContaining(['get_goal_periods', 'put_goal_period', 'list_recent_workouts', 'undo_write']))

    const day = toolResult(await post(rpc('tools/call', { name: 'get_day_status', arguments: { date: '2026-11-12' } })))
    // Toisen tilin ateria ei näy, vaikka service-rooli näkisi sen.
    expect(day.consumed).toBe(2500)
    expect(day.period).toMatchObject({ id: 2 })
  })

  it('suunnitelman muutos kulkee koko ketjun: kuiva kierros, vahvistus, loki, peruutus', async () => {
    const block = { id: 'blk-1', name: 'Voima 1', startDate: '2026-12-01', endDate: '2027-01-11', intent: 'strength' }
    const dry = toolResult(await post(rpc('tools/call', { name: 'put_training_block', arguments: { block } })))
    expect(dry).toMatchObject({ dryRun: true, wrote: false })
    expect(db.tables.workout_blocks).toHaveLength(0)

    const done = toolResult(await post(rpc('tools/call', { name: 'put_training_block', arguments: { block, confirm: dry.confirmToken } })))
    expect(done.wrote).toBe(true)
    expect(db.tables.workout_blocks[0]).toMatchObject({ id: 'blk-1', user_id: 'me', start_date: '2026-12-01' })

    const writes = toolResult(await post(rpc('tools/call', { name: 'list_writes', arguments: {} }))) as unknown as Row[]
    expect(writes[0]).toMatchObject({ tool: 'put_training_block', target_id: 'blk-1' })

    const undoDry = toolResult(await post(rpc('tools/call', { name: 'undo_write', arguments: { writeId: done.writeId } })))
    await post(rpc('tools/call', { name: 'undo_write', arguments: { writeId: done.writeId, confirm: undoDry.confirmToken } }))
    expect(db.tables.workout_blocks).toHaveLength(0)
  })

  it('tuntematon työkalu on virhe eikä kirjoitus', async () => {
    const r = await post(rpc('tools/call', { name: 'delete_meal', arguments: { id: 1 } }))
    expect((r.body as Row).error).toBeTruthy()
    expect(db.tables.meals).toHaveLength(2)
  })
})
