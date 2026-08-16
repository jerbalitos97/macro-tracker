// Where training and nutrition are planned against each other.
//
// The two were set in different tools, in different stores, and nothing ever
// compared them. That let the classic mistake through unnoticed: the steepest
// part of a cut sitting on top of a max-strength or peaking block, where the
// deficit costs exactly the quality the block exists to build.
//
// They are deliberately NOT merged into one object. Their date ranges honestly
// diverge — a twelve-week block can span a cut and the maintenance phase after
// it, and a refill week sits inside a block rather than beside it. Forcing one
// range would mean lying about one of them. So they stay two objects, the
// block gains an intent that says what it is for, and this module compares
// them and says when the combination does not work.

import type { GoalPeriod, PeriodType, Settings } from '../types'
import type { TrainingBlock } from './blocks'
import { getPeriods } from './goalPeriods'
import { daysBetween } from './dates'

export type BlockIntent =
  | 'base'
  | 'strength'
  | 'skill'
  | 'peak'
  | 'deload'
  | 'other'

export interface IntentSpec {
  label: string
  /** What the block is for, in one line. */
  blurb: string
  /** Fastest weekly weight change this block tolerates, as a share of body
   *  weight per week. Null means "no deficit at all during this block".
   *
   *  These are starting values from the general literature, not measurements
   *  of you. Once a block has run alongside a goal period, observedRate() puts
   *  what actually happened next to the number so it can be tuned. */
  maxWeeklyLossPct: number | null
  /** Protein floor for the block, g per kg body weight. */
  proteinPerKg: number
  /** Shown when a period conflicts with this intent. */
  advice: string
}

export const INTENTS: Record<BlockIntent, IntentSpec> = {
  base: {
    label: 'Perusjakso',
    blurb: 'Yleiskunto ja volyymi. Kestää eniten vajetta.',
    maxWeeklyLossPct: 0.7,
    proteinPerKg: 1.8,
    advice: 'Perusjakso kestää jyrkimmänkin vajeen — tämä on paras paikka pudottaa.',
  },
  strength: {
    label: 'Maksimivoima',
    blurb: 'Hermosto ja maksimivoima. Vaje syö suorituskykyä.',
    maxWeeklyLossPct: 0.3,
    proteinPerKg: 2.2,
    advice: 'Loivenna vaje tai siirrä jyrkin vaihe perus- tai välijaksolle. Proteiini ylös.',
  },
  skill: {
    label: 'Skillipiikki',
    blurb: 'Tekniikka ja hallinta. Vaatii virkeyttä.',
    maxWeeklyLossPct: 0.4,
    proteinPerKg: 2.0,
    advice: 'Taitoharjoittelu kärsii väsymyksestä ennen kuin voima kärsii — pidä vaje maltillisena.',
  },
  peak: {
    label: 'Kilpailu / turnauspiikki',
    blurb: 'Suorituskunto huipussaan. Ei vajetta.',
    maxWeeklyLossPct: null,
    proteinPerKg: 2.0,
    advice: 'Aja ylläpidolla. Kilpailukunto ja painonpudotus eivät mahdu samaan viikkoon.',
  },
  deload: {
    label: 'Välijakso / deload',
    blurb: 'Kevennys. Kuormittaa vähiten, joten vajeelle on tilaa.',
    maxWeeklyLossPct: 0.8,
    proteinPerKg: 1.8,
    advice: 'Välijakso on hyvä ikkuna joko jyrkälle vajeelle tai refillille.',
  },
  other: {
    label: 'Muu',
    blurb: 'Ei erityistä ravintovaatimusta.',
    maxWeeklyLossPct: 0.7,
    proteinPerKg: 1.8,
    advice: 'Ei blokkikohtaista rajaa — perusjakson raja käytössä.',
  },
}

export const INTENT_ORDER: BlockIntent[] = ['base', 'strength', 'skill', 'peak', 'deload', 'other']

export function intentOf(block: TrainingBlock): BlockIntent {
  return (block.intent as BlockIntent) ?? 'other'
}

/** Days two inclusive ranges share. */
export function overlapDays(
  a: { startDate: string; endDate: string },
  b: { startDate: string; endDate: string },
): number {
  const start = a.startDate > b.startDate ? a.startDate : b.startDate
  const end = a.endDate < b.endDate ? a.endDate : b.endDate
  if (start > end) return 0
  return daysBetween(start, end) + 1
}

/** kg/week the period plans for. Positive = losing. */
export function plannedWeeklyLossKg(p: GoalPeriod): number {
  const days = Math.max(1, daysBetween(p.startDate, p.endDate) + 1)
  return ((p.startWeight - p.targetWeight) / days) * 7
}

export type Severity = 'ok' | 'warn' | 'conflict'

export interface Clash {
  period: GoalPeriod
  block: TrainingBlock
  intent: BlockIntent
  /** Days the two share. */
  sharedDays: number
  severity: Severity
  /** kg/week the period asks for. */
  plannedKg: number
  /** kg/week the block tolerates. Null when the block wants no deficit. */
  allowedKg: number | null
  message: string
  /** What the period's target weight would need to be to fit the block. */
  suggestedTargetWeight: number | null
}

/** Compare every goal period against every training block it overlaps.
 *  Only cuts are constrained — a bulk, maintenance or refill asks nothing of
 *  recovery that a block would object to. */
export function findClashes(
  settings: Settings,
  blocks: TrainingBlock[],
  bodyWeightKg: number,
): Clash[] {
  const out: Clash[] = []
  for (const period of getPeriods(settings)) {
    if (period.type !== 'cut') continue
    const plannedKg = plannedWeeklyLossKg(period)
    if (plannedKg <= 0) continue

    for (const block of blocks) {
      const sharedDays = overlapDays(period, block)
      if (sharedDays < 7) continue // a few days of overlap is not a clash

      const intent = intentOf(block)
      const spec = INTENTS[intent]
      const allowedKg =
        spec.maxWeeklyLossPct === null ? null : (bodyWeightKg * spec.maxWeeklyLossPct) / 100

      let severity: Severity = 'ok'
      if (allowedKg === null) severity = 'conflict'
      else if (plannedKg > allowedKg * 1.25) severity = 'conflict'
      else if (plannedKg > allowedKg) severity = 'warn'

      if (severity === 'ok') continue

      const periodDays = Math.max(1, daysBetween(period.startDate, period.endDate) + 1)
      const suggestedTargetWeight =
        allowedKg === null
          ? period.startWeight
          : Math.round((period.startWeight - (allowedKg / 7) * periodDays) * 10) / 10

      out.push({
        period,
        block,
        intent,
        sharedDays,
        severity,
        plannedKg,
        allowedKg,
        suggestedTargetWeight,
        message:
          allowedKg === null
            ? `"${block.name || spec.label}" on kilpailupiikki, mutta jakso suunnittelee ${plannedKg.toFixed(2)} kg/vko pudotusta ${sharedDays} päivän ajan.`
            : `Jakso pyytää ${plannedKg.toFixed(2)} kg/vko, mutta "${block.name || spec.label}" kestää noin ${allowedKg.toFixed(2)} kg/vko (${spec.maxWeeklyLossPct} % kehonpainosta). Päällekkäisyys ${sharedDays} pv.`,
      })
    }
  }
  // Worst first, then longest overlap.
  return out.sort(
    (a, b) =>
      (a.severity === b.severity ? 0 : a.severity === 'conflict' ? -1 : 1) ||
      b.sharedDays - a.sharedDays,
  )
}

export interface BlockPlan {
  block: TrainingBlock
  intent: BlockIntent
  spec: IntentSpec
  /** Goal periods overlapping this block by a week or more. */
  periods: GoalPeriod[]
  clashes: Clash[]
  /** Fastest weekly loss this block tolerates for the given body weight. */
  allowedKg: number | null
  proteinTargetG: number
}

export function buildBlockPlans(
  settings: Settings,
  blocks: TrainingBlock[],
  bodyWeightKg: number,
): BlockPlan[] {
  const clashes = findClashes(settings, blocks, bodyWeightKg)
  const periods = getPeriods(settings)
  return blocks.map((block) => {
    const intent = intentOf(block)
    const spec = INTENTS[intent]
    return {
      block,
      intent,
      spec,
      periods: periods.filter((p) => overlapDays(p, block) >= 7),
      clashes: clashes.filter((c) => c.block.id === block.id),
      allowedKg:
        spec.maxWeeklyLossPct === null ? null : (bodyWeightKg * spec.maxWeeklyLossPct) / 100,
      proteinTargetG: Math.round(bodyWeightKg * spec.proteinPerKg),
    }
  })
}

// ── Protein ────────────────────────────────────────────────────────────────
// Two things raise the requirement above a maintenance baseline, and they
// stack: hard training, and a calorie deficit. Training is carried by the
// block's intent (a max-strength block asks more than a base block). The
// deficit matters because protein is what stops the body meeting an energy
// shortfall by taking apart muscle, so the deeper the cut the more is needed —
// which is why the recommendation moves with the *planned rate*, not merely
// with the fact that a cut is running.
//
// Capped at 2.6 g/kg: above that there is no evidence of further benefit, and
// a target nobody can eat is a target that gets ignored.
const PROTEIN_CAP_PER_KG = 2.6

export interface ProteinAdvice {
  gramsPerKg: number
  grams: number
  /** Plain-language reasons, in the order they were applied. */
  reasons: string[]
}

export function recommendProtein(args: {
  bodyWeightKg: number
  intent: BlockIntent | null
  periodType: PeriodType | null
  /** kg/week the period plans to lose; 0 or negative for maintenance/bulk. */
  plannedWeeklyLossKg: number
}): ProteinAdvice {
  const { bodyWeightKg, intent, periodType, plannedWeeklyLossKg } = args
  const reasons: string[] = []

  const base = intent ? INTENTS[intent].proteinPerKg : 1.8
  reasons.push(
    intent
      ? `${INTENTS[intent].label}: ${base.toFixed(1)} g/kg`
      : `Ei aktiivista blokkia: perustaso ${base.toFixed(1)} g/kg`,
  )

  let perKg = base
  if (periodType === 'cut' && plannedWeeklyLossKg > 0) {
    // Scale with how aggressive the cut is, as a share of body weight per week:
    // 0.3 %/vko → +0.2, 0.7 %/vko → +0.5, clamped either side.
    const pctPerWeek = (plannedWeeklyLossKg / bodyWeightKg) * 100
    const add = Math.min(0.5, Math.max(0.2, 0.2 + ((pctPerWeek - 0.3) / 0.4) * 0.3))
    perKg += add
    reasons.push(`Vaje ${pctPerWeek.toFixed(2)} %/vko: +${add.toFixed(1)} g/kg`)
  } else if (periodType === 'bulk') {
    perKg += 0.1
    reasons.push('Bulk: +0,1 g/kg')
  } else if (periodType) {
    reasons.push(`${periodType}: ei lisäystä`)
  }

  if (perKg > PROTEIN_CAP_PER_KG) {
    perKg = PROTEIN_CAP_PER_KG
    reasons.push(`Katto ${PROTEIN_CAP_PER_KG} g/kg`)
  }

  return {
    gramsPerKg: Math.round(perKg * 100) / 100,
    grams: Math.round(bodyWeightKg * perKg),
    reasons,
  }
}

/** The target weight a cut spanning `days` may aim for without exceeding what
 *  `intent` tolerates. Used to prefill the goal editor from a block. */
export function targetWeightFor(
  intent: BlockIntent,
  startWeight: number,
  days: number,
): number {
  const pct = INTENTS[intent].maxWeeklyLossPct
  if (pct === null) return startWeight
  const perWeek = (startWeight * pct) / 100
  return Math.round((startWeight - (perWeek / 7) * days) * 10) / 10
}
