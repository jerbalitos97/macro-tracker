// The v2 session templates, as data.
//
// Every slot that depends on the room carries its own `env`, and every slot
// whose intensity depends on how a joint feels carries its own `gate`. The two
// are independent: a movement can need a kettlebell *and* be gated on the knee,
// and lib/sessionResolve.ts applies them in that order.
//
// Where a fallback exists it keeps the intensity by leverage or tempo rather
// than by adding reps — see the note on EnvRequirement in lib/workouts.ts for
// why that distinction is not cosmetic.

import type { TemplateExercise, WorkoutTemplate, Prescription } from './workouts'
import { getTemplates, saveTemplate, setArchived, syncTemplateCloud, uid } from './workouts'

/** Version marker matching the existing "S1 · …" naming. */
export const SEED_VERSION = 'v2'

const BLOCK_NOTE =
  'Maksimivoimablokki: 5.10. alkaen jalkaslotin kehittävä variantti vaihdetaan saliversioon — ' +
  'trap bar -maastaveto 3–5 × 3–5 (aloitus ~60 %) TAI clean pull / hang power clean 4 × 2–3 @ 70–85 %.'

// ── Shared environment fallbacks ───────────────────────────────────────────

/** No weight to hang on you: keep the intensity with a harder leverage or a
 *  slower tempo, never with more reps. */
const noLoadPullFallback: Prescription = {
  name: 'Archer pull-up',
  sets: 4,
  reps: { min: 4, max: 6 },
  note: '/puoli · vaihtoehto: tempoleuka 3-1-3 × 5–6, RIR 1–2',
}

const noLoadDipFallback: Prescription = {
  name: 'Tempodippi',
  sets: 2,
  reps: 8,
  tempo: '3-0-3',
}

const noLoadSplitSquatFallback: Prescription = {
  name: 'Split squat, kehonpaino',
  sets: 3,
  reps: { min: 6, max: 8 },
  tempo: '5-0-1',
  note: '1.5-toistot tai hidas eksentrinen, RIR 1–2 — kuormaa korvataan tempolla, ei toistoilla',
}

const noLoadRdlFallback: Prescription = {
  name: 'Slider / pyyhe leg curl',
  sets: 3,
  reps: { min: 8, max: 10 },
  note: 'Sarana ilman kuormaa ei aja tavoitetta — tee kuormallinen sarana seuraavana kuulapäivänä',
}

const noBoxJumpFallback: Prescription = {
  name: 'Maksimaalinen CMJ / aitahyppy',
  sets: 3,
  reps: 5,
  note: 'täysi palautus sarjojen välissä',
}

const noAnchorNordicFallback: Prescription = {
  name: 'Slider leg curl',
  sets: 3,
  reps: { min: 6, max: 8 },
}

const noAnchorSpanishFallback: Prescription = {
  name: 'Seinäistunta ~45° polvikulmalla',
  sets: 5,
  holdSeconds: 45,
}

const paralletteFallbackNote = 'Ei paraletteja: pidot nyrkeillä tai korotuksilla, ranneportin rajoissa'

const onParallettes = (name: string, sets: number, holdSeconds: number): TemplateExercise['env'] => ({
  requires: ['parallettes'],
  fallback: { name: `${name} (nyrkeillä)`, sets, holdSeconds, note: paralletteFallbackNote },
})

// ── Shared gated slots ─────────────────────────────────────────────────────

/** The leg slot. Its develop variant needs load and its treat variant needs an
 *  anchor, so the requirement sits on each variant rather than on the slot. */
const legSlot = (
  developName: string,
  developNote: string,
): TemplateExercise['gate'] => ({
  bodyRegion: 'knee',
  variants: {
    develop: {
      name: developName,
      sets: 3,
      reps: { min: 6, max: 8 },
      tempo: '3-0-X',
      note: developNote,
      env: { requires: ['externalLoad'], fallback: noLoadSplitSquatFallback },
    },
    hybrid: {
      name: 'Isometria + kevyt split squat',
      sets: 3,
      holdSeconds: 30,
      note: '3 × 30 s isometria, sitten split squat 2 × 8 kevyellä',
    },
    treat: {
      name: 'Spanish squat / knee extension isometria',
      sets: 5,
      holdSeconds: 45,
      note: '70–80 % MVC',
      env: { requires: ['anchorAndBand'], fallback: noAnchorSpanishFallback },
    },
    rest: null,
  },
})

/** Step downs and Bulgarian split squats share the knee's staircase. */
const kneeStaircase = (name: string, sets: number): TemplateExercise['gate'] => ({
  bodyRegion: 'knee',
  variants: {
    develop: { name, sets, reps: { min: 8, max: 10 }, note: '/jalka' },
    hybrid: { name: `${name} (kevyt)`, sets: 2, reps: 8, note: '/jalka' },
    treat: null,
    rest: null,
  },
})

/** Front-lever volume is carried by the back gate: fewer sets, never a
 *  different movement — the shape is the training effect. */
const flVolume = (name: string, sets: number, holdSeconds: number, reps?: number): TemplateExercise['gate'] => ({
  bodyRegion: 'back',
  variants: {
    develop: { name, sets, holdSeconds, reps },
    hybrid: { name, sets: sets - 1, holdSeconds, reps },
    treat: { name, sets: 2, holdSeconds, reps },
  },
})

const freestyleSlot = (minutes: number): TemplateExercise => ({
  id: `freestyle-${minutes}`,
  name: `Freestyle-slotti ${minutes} min`,
  defaultSets: 1,
  defaultDuration: minutes * 60,
  env: {
    requires: ['muscleUpBar'],
    fallback: {
      name: `Freestyle-slotti ${minutes} min`,
      sets: 1,
      holdSeconds: minutes * 60,
      note:
        'MU ei onnistu täällä → räjähtävät chest-to-bar 4 × 3 + transitioharjoittelu matalalla ' +
        'tangolla; varsinainen MU-työ Mikon sessioihin',
    },
  },
})

const wristPrep: TemplateExercise = {
  id: 'wrist-prep',
  name: 'Ranne + kyynärvarsi prep',
  defaultSets: 2,
  repRange: { min: 15, max: 15 },
  gate: {
    bodyRegion: 'wrist',
    variants: {
      develop: { name: 'Ranne + kyynärvarsi prep', sets: 2, reps: 15 },
      hybrid: { name: 'Ranne + kyynärvarsi prep', sets: 2, reps: 15 },
      treat: {
        name: 'Ranteen kuntoutus',
        sets: 3,
        reps: 15,
        tempo: 'hidas eksentrinen',
        note: 'kevyt kuorma + kuormitettu venytys',
      },
    },
  },
}

const cubanRotation = (sets: number, min: number, max: number): TemplateExercise => ({
  id: `cuban-${sets}`,
  name: 'Cuban rotation / band ER',
  defaultSets: sets,
  repRange: { min, max },
})

const hollowHold: TemplateExercise = {
  id: 'hollow-hold',
  name: 'Hollow body hold',
  defaultSets: 3,
  defaultDuration: 20,
}

// ── The five sessions ──────────────────────────────────────────────────────

function s1(): TemplateExercise[] {
  return [
    {
      id: 's1v2-1',
      name: 'Baby straddle + jalkojen avausyritykset',
      defaultSets: 4,
      defaultDuration: 4,
      note: 'Kirjaa avauskulma ja pitoaika',
      env: onParallettes('Baby straddle + avausyritykset', 4, 4),
    },
    {
      id: 's1v2-2',
      name: 'Baby straddle hold',
      defaultSets: 5,
      defaultDuration: 10,
      env: onParallettes('Baby straddle hold', 5, 10),
    },
    {
      id: 's1v2-3',
      name: 'Planche lean -pidot',
      defaultSets: 5,
      defaultDuration: 10,
      gate: {
        bodyRegion: 'wrist',
        variants: {
          develop: { name: 'Planche lean -pidot (lattialla)', sets: 5, holdSeconds: 10 },
          hybrid: {
            name: 'Planche lean -pidot (paraleteilla)',
            sets: 5,
            holdSeconds: 10,
            note: 'sama kaltevuus',
            env: { requires: ['parallettes'], fallback: { name: 'Planche lean (nyrkeillä)', sets: 5, holdSeconds: 10, note: paralletteFallbackNote } },
          },
          treat: {
            name: 'Planche lean -pidot (paraleteilla, loivempi)',
            sets: 3,
            holdSeconds: 10,
            env: { requires: ['parallettes'], fallback: { name: 'Planche lean (nyrkeillä, loivempi)', sets: 3, holdSeconds: 10, note: paralletteFallbackNote } },
          },
        },
      },
    },
    {
      id: 's1v2-4',
      name: 'Pseudo planche push-up',
      defaultSets: 4,
      repRange: { min: 4, max: 6 },
      tempo: '3–4 s eksentrinen',
      gate: {
        bodyRegion: 'wrist',
        variants: {
          develop: { name: 'Pseudo planche push-up (lattialla)', sets: 4, reps: { min: 4, max: 6 }, tempo: '3–4 s eksentrinen' },
          hybrid: {
            name: 'Pseudo planche push-up (paraleteilla)',
            sets: 4,
            reps: { min: 4, max: 6 },
            tempo: '3–4 s eksentrinen',
            env: { requires: ['parallettes'], fallback: { name: 'Pseudo PPU (nyrkeillä)', sets: 4, reps: { min: 4, max: 6 }, note: paralletteFallbackNote } },
          },
          treat: null,
        },
      },
    },
    {
      id: 's1v2-5',
      name: 'Weighted dips',
      defaultSets: 2,
      repRange: { min: 8, max: 10 },
      env: { requires: ['externalLoad'], fallback: noLoadDipFallback },
    },
    {
      id: 's1v2-6',
      name: 'Jalkaslotti',
      defaultSets: 3,
      repRange: { min: 6, max: 8 },
      gate: legSlot('ATG split squat', '3 s alas / räjähtävä ylös, kuormalla, RIR 1–2'),
    },
    wristPrep,
    cubanRotation(2, 15, 15),
  ]
}

function s2(): TemplateExercise[] {
  return [
    {
      id: 's2v2-1',
      name: 'Depth jumps 30–40 cm',
      defaultSets: 3,
      repRange: { min: 4, max: 4 },
      note: 'Session alussa, 2–3 min palautus',
      env: { requires: ['plyoBox'], fallback: noBoxJumpFallback },
      gate: {
        bodyRegion: 'back',
        variants: {
          develop: { name: 'Depth jumps 30–40 cm', sets: 3, reps: 4, note: '2–3 min palautus' },
          hybrid: { name: 'Depth jumps 30–40 cm', sets: 2, reps: 3 },
          treat: null,
        },
      },
    },
    {
      id: 's2v2-2',
      name: 'Approach jumps, täysi vauhti',
      defaultSets: 3,
      repRange: { min: 3, max: 3 },
      gate: {
        bodyRegion: 'back',
        variants: {
          develop: { name: 'Approach jumps, täysi vauhti', sets: 3, reps: 3 },
          hybrid: { name: 'Approach jumps', sets: 2, reps: 2 },
          treat: null,
        },
      },
    },
    {
      id: 's2v2-3',
      name: 'Straddle FL attempts',
      defaultSets: 4,
      defaultDuration: 4,
      gate: flVolume('Straddle FL attempts', 4, 4),
    },
    {
      id: 's2v2-4',
      name: 'FL negatives (5 s lasku)',
      defaultSets: 4,
      repRange: { min: 2, max: 3 },
      gate: {
        bodyRegion: 'back',
        variants: {
          develop: { name: 'FL negatives (5 s lasku)', sets: 4, reps: { min: 2, max: 3 } },
          hybrid: { name: 'FL negatives (5 s lasku)', sets: 3, reps: 2 },
          treat: null,
        },
      },
    },
    {
      id: 's2v2-5',
      name: 'Weighted pull-ups',
      defaultSets: 4,
      repRange: { min: 5, max: 8 },
      env: { requires: ['externalLoad'], fallback: noLoadPullFallback },
    },
    {
      id: 's2v2-6',
      name: 'Nordic curl',
      defaultSets: 2,
      repRange: { min: 4, max: 6 },
      note: 'Progressio 1 × 3–5 → 2–3 × 6–8',
      env: { requires: ['anchorAndBand'], fallback: noAnchorNordicFallback },
      gate: {
        bodyRegion: 'knee',
        variants: {
          develop: { name: 'Nordic curl', sets: 2, reps: { min: 4, max: 6 } },
          hybrid: { name: 'Nordic curl', sets: 2, reps: 4 },
          treat: { name: 'Nordic curl, avustettu', sets: 2, reps: 4, note: 'suuri avustus, hidas eksentrinen' },
          rest: null,
        },
      },
    },
    {
      id: 's2v2-7',
      name: '1-jalan RDL kahvakuulilla',
      defaultSets: 3,
      repRange: { min: 6, max: 8 },
      note: '/jalka, RIR 1–2',
      env: { requires: ['externalLoad'], fallback: noLoadRdlFallback },
      gate: {
        bodyRegion: 'back',
        variants: {
          develop: { name: '1-jalan RDL kahvakuulilla', sets: 3, reps: { min: 6, max: 8 }, note: '/jalka, RIR 1–2' },
          hybrid: { name: '1-jalan RDL, kevyempi', sets: 3, reps: 8, note: '−20 % kuormasta' },
          treat: { name: '1-jalan RDL, kevyt', sets: 2, reps: 10, note: '+ kävely 20 min' },
        },
      },
    },
    {
      id: 's2v2-8',
      name: 'Step downs',
      defaultSets: 3,
      repRange: { min: 8, max: 10 },
      gate: kneeStaircase('Step downs', 3),
    },
    {
      id: 's2v2-9',
      name: 'Bulgarian split squat',
      defaultSets: 3,
      repRange: { min: 6, max: 8 },
      note: 'Hallittu alas, räjähtävä ylös',
      gate: {
        bodyRegion: 'knee',
        variants: {
          develop: { name: 'Bulgarian split squat', sets: 3, reps: { min: 6, max: 8 }, note: '/jalka, hallittu alas + räjähtävä ylös' },
          hybrid: { name: 'Bulgarian split squat (kevyt)', sets: 2, reps: 8, note: '/jalka' },
          treat: null,
          rest: null,
        },
      },
    },
  ]
}

function s3(): TemplateExercise[] {
  return [
    freestyleSlot(20),
    {
      id: 's3v2-2',
      name: 'Adv tuck / baby straddle hold',
      defaultSets: 5,
      defaultDuration: 10,
      env: onParallettes('Adv tuck / baby straddle hold', 5, 10),
    },
    {
      id: 's3v2-3',
      name: 'Tuck planche PU / planche lean',
      defaultSets: 3,
      repRange: { min: 4, max: 6 },
      gate: {
        bodyRegion: 'wrist',
        variants: {
          develop: { name: 'Tuck planche PU (lattialla)', sets: 3, reps: { min: 4, max: 6 } },
          hybrid: {
            name: 'Tuck planche PU (paraleteilla)',
            sets: 3,
            reps: { min: 4, max: 6 },
            env: { requires: ['parallettes'], fallback: { name: 'Tuck planche PU (nyrkeillä)', sets: 3, reps: { min: 4, max: 6 }, note: paralletteFallbackNote } },
          },
          treat: null,
        },
      },
    },
    { id: 's3v2-4', name: 'HSPU seinää vasten', defaultSets: 2, repRange: { min: 6, max: 8 } },
    {
      id: 's3v2-5',
      name: 'KB-nosto hollow holdissa',
      defaultSets: 3,
      repRange: { min: 8, max: 12 },
      note: 'Suoran käden pullover säilyy tässä',
      env: { requires: ['externalLoad'], fallback: { name: 'Hollow hold + suoran käden nosto ilman kuormaa', sets: 3, reps: 12, tempo: 'hidas' } },
    },
    cubanRotation(3, 8, 12),
  ]
}

function s4(): TemplateExercise[] {
  return [
    {
      id: 's4v2-1',
      name: 'Straddle FL holds, clean form',
      defaultSets: 4,
      defaultDuration: 8,
      gate: flVolume('Straddle FL holds, clean form', 4, 8),
    },
    { id: 's4v2-2', name: 'Tuck FL pull-ups', defaultSets: 4, repRange: { min: 3, max: 5 } },
    {
      id: 's4v2-3',
      name: '1-leg FL hold',
      defaultSets: 4,
      defaultDuration: 8,
      gate: flVolume('1-leg FL hold', 4, 8),
    },
    {
      id: 's4v2-4',
      name: 'Jalkaslotti',
      defaultSets: 3,
      repRange: { min: 6, max: 8 },
      gate: legSlot('HSR split squat', '3 s alas, kuormalla'),
    },
    {
      id: 's4v2-5',
      name: 'Step downs',
      defaultSets: 2,
      repRange: { min: 8, max: 10 },
      gate: kneeStaircase('Step downs', 2),
    },
    hollowHold,
  ]
}

function s5(): TemplateExercise[] {
  return [
    freestyleSlot(15),
    {
      id: 's5v2-2',
      name: 'Baby straddle / adv tuck hold',
      defaultSets: 4,
      defaultDuration: 10,
      env: onParallettes('Baby straddle / adv tuck hold', 4, 10),
    },
    {
      id: 's5v2-3',
      name: 'Straddle FL holds',
      defaultSets: 4,
      defaultDuration: 8,
      gate: flVolume('Straddle FL holds', 4, 8),
    },
    {
      id: 's5v2-4',
      name: 'Tuck planche PU tai pseudo PPU',
      defaultSets: 3,
      repRange: { min: 4, max: 6 },
      gate: {
        bodyRegion: 'wrist',
        variants: {
          develop: { name: 'Tuck planche PU (lattialla)', sets: 3, reps: { min: 4, max: 6 } },
          hybrid: {
            name: 'Pseudo PPU (paraleteilla)',
            sets: 3,
            reps: { min: 4, max: 6 },
            env: { requires: ['parallettes'], fallback: { name: 'Pseudo PPU (nyrkeillä)', sets: 3, reps: { min: 4, max: 6 }, note: paralletteFallbackNote } },
          },
          treat: null,
        },
      },
    },
    { id: 's5v2-5', name: 'Tuck FL pull-ups', defaultSets: 3, repRange: { min: 3, max: 5 } },
    {
      id: 's5v2-6',
      name: 'Jalkaslotti',
      defaultSets: 3,
      repRange: { min: 6, max: 8 },
      gate: legSlot('HSR split squat', '3 s alas, kuormalla'),
    },
    {
      id: 's5v2-7',
      name: 'Step downs',
      defaultSets: 2,
      repRange: { min: 8, max: 10 },
      gate: kneeStaircase('Step downs', 2),
    },
    hollowHold,
  ]
}

export interface SeedSpec {
  slug: string
  name: string
  color: string
  position: number
  exercises: TemplateExercise[]
}

export const V2_TEMPLATES: SeedSpec[] = [
  { slug: 's1', name: `S1 ${SEED_VERSION} · Push + jalat A (raskas)`, color: '#22d3ee', position: 0, exercises: s1() },
  { slug: 's2', name: `S2 ${SEED_VERSION} · Pull + jalat B (raskas)`, color: '#a78bfa', position: 1, exercises: s2() },
  { slug: 's3', name: `S3 ${SEED_VERSION} · Push + freestyle (medium)`, color: '#f472b6', position: 2, exercises: s3() },
  { slug: 's4', name: `S4 ${SEED_VERSION} · Pull + polvislotti (medium)`, color: '#fb923c', position: 3, exercises: s4() },
  { slug: 's5', name: `S5 ${SEED_VERSION} · Push + pull yhdistetty (medium)`, color: '#4ade80', position: 4, exercises: s5() },
]

export function buildV2Templates(now: string, idFor: (slug: string) => string): WorkoutTemplate[] {
  return V2_TEMPLATES.map((t) => ({
    id: idFor(t.slug),
    name: t.name,
    kind: 'strength' as const,
    color: t.color,
    position: t.position,
    exercises: t.exercises.map((e) => ({ ...e, id: `${t.slug}-${e.id}` })),
    note: BLOCK_NOTE,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  }))
}

/** Names of the templates the v2 set replaces. Matched by prefix so a renamed
 *  "S1 · …" is still recognised, and so the mobility templates are untouched. */
export const REPLACED_PREFIXES = ['S1 ·', 'S2 ·', 'S3 ·', 'S4 ·', 'S5 ·']

export function isReplacedByV2(name: string): boolean {
  return REPLACED_PREFIXES.some((p) => name.startsWith(p))
}

/** Create the v2 set once, then retire the templates it replaces.
 *
 *  Ordering matters: the old ones are only archived after the new ones exist,
 *  so a failure half-way leaves a usable app rather than no strength templates
 *  at all. Archiving is not deletion — every session ever logged from S1–S5
 *  keeps pointing at a template that still exists.
 *
 *  Idempotent: presence of the v2 names is the flag, so this can run on every
 *  mount without a separate "seeded" marker to get out of sync. */
export function ensureV2Templates(userId?: string): { created: number; archived: number } {
  const existing = getTemplates()
  const haveV2 = existing.some((t) => t.name.includes(`${SEED_VERSION} ·`))
  if (haveV2) return { created: 0, archived: 0 }

  const now = new Date().toISOString()
  const built = buildV2Templates(now, () => uid())
  for (const t of built) {
    saveTemplate(t)
    if (userId) syncTemplateCloud(userId, t)
  }

  let archived = 0
  for (const t of existing) {
    if (!isReplacedByV2(t.name) || t.archivedAt) continue
    setArchived(t.id, true)
    archived++
    const updated = getTemplates().find((x) => x.id === t.id)
    if (userId && updated) syncTemplateCloud(userId, updated)
  }

  return { created: built.length, archived }
}
