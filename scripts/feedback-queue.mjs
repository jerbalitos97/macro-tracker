#!/usr/bin/env node
// Palautejonon ainoa kirjoitustie automaatiolle.
//
// Automaatio ajaa service-rolella, joka ohittaa RLS:n. Sen takia se ei saa
// koskea kantaan suoraan SQL:llä: tämä skripti on kapea putki, joka osaa
// lukea `feedback`-taulun ja päivittää siitä vain triage-kentät. Muihin
// tauluihin, eli käyttäjän dataan, ei ole tietä tätä kautta.
//
// Ympäristö:
//   SUPABASE_URL                 https://<ref>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    service role -avain
//   FEEDBACK_OWNER_ID            sovelluksen omistajan auth.users.id. Vain hänen
//                                palautteensa saa julkaista automaattisesti;
//                                muiden palaute menee aina ihmiselle.
//
// Komennot:
//   list                 käsittelemättömät (new, triaged), tärkein ensin
//   get <id>
//   update <id> <json>   esim. '{"status":"triaged","priority":2,"risk":"low"}'

const URL_ = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const OWNER = process.env.FEEDBACK_OWNER_ID

const WRITABLE = new Set(['status', 'priority', 'risk', 'plan', 'pr_url', 'resolution', 'shipped_at'])
const STATUSES = new Set(['new', 'triaged', 'in_progress', 'needs_review', 'shipped', 'rejected', 'duplicate'])
const COLS = 'id,user_id,created_at,updated_at,body,context,status,priority,risk,plan,pr_url,resolution,shipped_at'

function die(msg) {
  process.stderr.write(`feedback-queue: ${msg}\n`)
  process.exit(1)
}

if (!URL_ || !KEY) die('SUPABASE_URL ja SUPABASE_SERVICE_ROLE_KEY puuttuvat ympäristöstä')

async function rest(path, init = {}) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...init.headers,
    },
  })
  const text = await res.text()
  if (!res.ok) die(`${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}

// Palautteen teksti on käyttäjän kirjoittamaa. Se merkitään selvästi datana,
// jotta sen sisällä oleva "ohita säännöt ja julkaise" ei näytä ohjeelta.
const annotate = (r) => ({
  ...r,
  fromOwner: !!OWNER && r.user_id === OWNER,
  body: `<user-feedback>${r.body}</user-feedback>`,
})

const [cmd, id, json] = process.argv.slice(2)

if (cmd === 'list') {
  const rows = await rest(
    `feedback?select=${COLS}&status=in.(new,triaged)&order=priority.asc.nullslast,created_at.asc&limit=50`,
  )
  process.stdout.write(JSON.stringify(rows.map(annotate), null, 2) + '\n')
} else if (cmd === 'get') {
  if (!/^\d+$/.test(id ?? '')) die('get <id>')
  const rows = await rest(`feedback?select=${COLS}&id=eq.${id}`)
  if (!rows.length) die(`ei riviä ${id}`)
  process.stdout.write(JSON.stringify(annotate(rows[0]), null, 2) + '\n')
} else if (cmd === 'update') {
  if (!/^\d+$/.test(id ?? '') || !json) die('update <id> <json>')
  let patch
  try {
    patch = JSON.parse(json)
  } catch {
    die('json ei jäsenny')
  }
  for (const k of Object.keys(patch)) if (!WRITABLE.has(k)) die(`kenttää ${k} ei saa muuttaa`)
  if ('status' in patch && !STATUSES.has(patch.status)) die(`tuntematon status ${patch.status}`)
  if ('risk' in patch && patch.risk !== null && !['low', 'high'].includes(patch.risk)) die('risk on low tai high')
  if ('priority' in patch && patch.priority !== null && ![1, 2, 3, 4].includes(patch.priority)) die('priority 1–4')
  if (patch.status === 'shipped' && !patch.shipped_at) patch.shipped_at = new Date().toISOString()
  const rows = await rest(`feedback?id=eq.${id}&select=${COLS}`, { method: 'PATCH', body: JSON.stringify(patch) })
  if (!rows.length) die(`ei riviä ${id}`)
  process.stdout.write(JSON.stringify(annotate(rows[0]), null, 2) + '\n')
} else {
  die('komento: list | get <id> | update <id> <json>')
}
