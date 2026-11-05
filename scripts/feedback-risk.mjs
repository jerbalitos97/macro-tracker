#!/usr/bin/env node
// Palauteautomaation riskiraja — koodina, ei harkintana.
//
// Automaatio saa julkaista muutoksen tuotantoon ilman ihmistä vain jos tämä
// skripti sanoo `low`. Päätös on tarkoituksella mekaaninen: malli joka on juuri
// kirjoittanut muutoksen on huonoin mahdollinen arvioimaan sen vaarallisuutta,
// koska se on jo vakuuttunut että muutos on hyvä.
//
// Raja vetää viivan sen mukaan mitä rollback EI korjaa. Vercelin rollback
// palauttaa koodin, mutta ei:
//   · localStorageen kirjoitettua dataa (monen työkalun ainoa totuus)
//   · kantaan ajettua migraatiota
//   · synkkaa joka on jo vienyt rikkinäiset rivit pilveen
//   · palvelinpuolta (api/), joka kirjoittaa kantaan
// Kaikki mikä koskee niitä on `high` ja menee PR:ksi ihmiselle.
//
// Käyttö:  node scripts/feedback-risk.mjs [base-ref]     (oletus origin/main)
// Tulostaa JSONin { risk: 'low'|'high', reasons: string[], files, linesChanged }.

import { execFileSync } from 'node:child_process'

const base = process.argv[2] ?? 'origin/main'
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

// Tiedostot ja hakemistot joihin automaatio ei koske ilman ihmistä.
// Etuliite-vertailu: 'supabase/' kattaa koko hakemiston.
const HIGH_PATHS = [
  // Data ja sen säilyminen
  'src/lib/storage.ts',
  'src/lib/sync.ts',
  'src/lib/exportData.ts',
  'src/lib/supabase.ts',
  // Laskenta jonka varassa suunnitelma on — virhe näkyy vasta viikkojen päästä
  'src/lib/energy.ts',
  'src/lib/compute.ts',
  'src/lib/analysis.ts',
  'src/lib/goalPeriods.ts',
  'src/lib/weight.ts',
  'src/lib/gates.ts',
  'src/lib/sessionResolve.ts',
  'src/lib/compensation.ts',
  'src/lib/maintenanceGuard.ts',
  // Oikeudet ja kirjautuminen
  'src/contexts/AuthContext.tsx',
  'src/contexts/ToolsContext.tsx',
  'src/lib/roles.ts',
  'src/lib/userTools.ts',
  'src/lib/viewAccess.ts',
  'src/lib/invites.ts',
  // Palvelin, kanta, julkaisu, riippuvuudet
  'api/',
  'supabase/',
  '.github/',
  'scripts/',
  'automation/',
  'vercel.json',
  'vite.config.ts',
  'tsconfig.json',
  'package.json',
  'package-lock.json',
  'playwright.config.ts',
  'index.html',
  'CLAUDE.md',
]

const MAX_FILES = 8
const MAX_LINES = 200

const reasons = []

const numstat = git('diff', '--numstat', '-M', `${base}...HEAD`).trim()
const nameStatus = git('diff', '--name-status', '-M', `${base}...HEAD`).trim()

const files = []
let linesChanged = 0
for (const line of numstat ? numstat.split('\n') : []) {
  const [add, del, ...rest] = line.split('\t')
  const path = rest.join('\t')
  if (add === '-' || del === '-') reasons.push(`binääritiedosto: ${path}`)
  const a = Number(add) || 0
  const d = Number(del) || 0
  linesChanged += a + d
  files.push({ path, added: a, deleted: d })
}

if (files.length === 0) reasons.push('ei muutoksia — mitään julkaistavaa ei ole')

for (const line of nameStatus ? nameStatus.split('\n') : []) {
  const [status, ...paths] = line.split('\t')
  if (status.startsWith('D')) reasons.push(`tiedosto poistettu: ${paths[0]}`)
  if (status.startsWith('R')) reasons.push(`tiedosto nimetty uudelleen: ${paths.join(' → ')}`)
}

for (const f of files) {
  const p = f.path

  // sw.js: vain CACHE-version nosto on sallittu. Se on pakollinen jokaisessa
  // julkaisussa, joten sen pitää kulkea low-reittiä.
  if (p === 'public/sw.js') {
    const diff = git('diff', '-U0', `${base}...HEAD`, '--', p)
    const changed = diff.split('\n').filter((l) => /^[+-](?![+-])/.test(l))
    const onlyCache = changed.every((l) => /^[+-]\s*const CACHE = '[^']+'\s*$/.test(l))
    if (!onlyCache) reasons.push('public/sw.js muuttui muualtakin kuin CACHE-riviltä')
    continue
  }

  // Testejä saa lisätä, ei heikentää. Poistettu rivi testitiedostossa voi
  // olla juuri se tarkistus joka olisi pysäyttänyt tämän muutoksen.
  if (p.startsWith('e2e/')) {
    if (f.deleted > 0) reasons.push(`testejä muutettu tai poistettu: ${p}`)
    continue
  }

  const hit = HIGH_PATHS.find((h) => (h.endsWith('/') ? p.startsWith(h) : p === h))
  if (hit) reasons.push(`suojattu polku: ${p}`)

  if (p.startsWith('public/') && p !== 'public/sw.js') reasons.push(`julkinen staattinen tiedosto: ${p}`)
}

// Uusi tai muuttunut tallennusavain missä tahansa tiedostossa. Avaimen
// vaihtaminen hylkää vanhan datan hiljaa — sovellus näyttää tyhjältä ja
// käyttäjä luulee kaiken kadonneen.
const code = git('diff', '-U0', `${base}...HEAD`, '--', 'src')
for (const l of code.split('\n')) {
  if (!/^[+-](?![+-])/.test(l)) continue
  if (/localStorage|sessionStorage|indexedDB/.test(l)) {
    reasons.push(`selaimen tallennusta koskeva rivi: ${l.slice(0, 120).trim()}`)
  } else if (/['"`][\w.-]+:v\d+['"`]/.test(l)) {
    reasons.push(`tallennusavaimen näköinen merkkijono: ${l.slice(0, 120).trim()}`)
  } else if (/\.from\(\s*['"`]\w+['"`]|\.(insert|upsert|rpc)\(/.test(l)) {
    // Kantakutsu missä tahansa näkymässä. Varovainen: lukukin osuu tähän,
    // mutta väärä `high` maksaa yhden PR-katselmoinnin, väärä `low` dataa.
    reasons.push(`kantakutsu: ${l.slice(0, 120).trim()}`)
  }
}

if (files.length > MAX_FILES) reasons.push(`liian monta tiedostoa (${files.length} > ${MAX_FILES})`)
if (linesChanged > MAX_LINES) reasons.push(`liian iso muutos (${linesChanged} riviä > ${MAX_LINES})`)

const swTouched = files.some((f) => f.path === 'public/sw.js')
if (files.length > 0 && !swTouched) reasons.push('public/sw.js CACHE-versiota ei nostettu — vanha build jäisi välimuistiin')

const out = {
  risk: reasons.length === 0 ? 'low' : 'high',
  reasons: [...new Set(reasons)],
  files: files.map((f) => f.path),
  linesChanged,
  base,
}
process.stdout.write(JSON.stringify(out, null, 2) + '\n')
