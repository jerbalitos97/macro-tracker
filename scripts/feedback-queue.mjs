#!/usr/bin/env node
// Palautejonon ainoa kirjoitustie automaatiolle.
//
// Skripti ei koske kantaan. Se kutsuu Vercelin /api/feedback-queue-päätettä,
// joka osaa vain lukea `feedback`-taulun ja päivittää siitä triage-kentät.
// Supabase-avain on vain Vercelissä: automaation ympäristössä on pelkkä
// FEEDBACK_AUTOMATION_TOKEN, jolla ei pääse käyttäjän dataan, vaikka
// palautteen sisältämä prompt-injektio yrittäisi.
//
// Ympäristö:
//   FEEDBACK_AUTOMATION_TOKEN    sama arvo kuin Vercelin env-muuttujassa
//   FRIDAY_API_URL               valinnainen, oletus tuotanto
//
// Komennot:
//   list                 käsittelemättömät (new, triaged), tärkein ensin
//   get <id>
//   update <id> <json>   esim. '{"status":"triaged","priority":2,"risk":"low"}'
//
// Validointi (sallitut kentät, statukset, risk, priority) tehdään palvelimella.

const BASE = (process.env.FRIDAY_API_URL || 'https://macro-tracker-nine-olive.vercel.app').replace(/\/$/, '')
const TOKEN = process.env.FEEDBACK_AUTOMATION_TOKEN

function die(msg) {
  process.stderr.write(`feedback-queue: ${msg}\n`)
  process.exit(1)
}

if (!TOKEN) die('FEEDBACK_AUTOMATION_TOKEN puuttuu ympäristöstä')

async function call(query, init = {}) {
  const res = await fetch(`${BASE}/api/feedback-queue${query}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...init.headers },
  })
  const text = await res.text()
  if (!res.ok) die(`${res.status} ${text}`)
  return JSON.parse(text)
}

const out = (v) => process.stdout.write(JSON.stringify(v, null, 2) + '\n')
const [cmd, id, json] = process.argv.slice(2)

if (cmd === 'list') {
  out(await call(''))
} else if (cmd === 'get') {
  if (!/^\d+$/.test(id ?? '')) die('get <id>')
  out(await call(`?id=${id}`))
} else if (cmd === 'update') {
  if (!/^\d+$/.test(id ?? '') || !json) die('update <id> <json>')
  try {
    JSON.parse(json)
  } catch {
    die('json ei jäsenny')
  }
  out(await call(`?id=${id}`, { method: 'PATCH', body: json }))
} else {
  die('komento: list | get <id> | update <id> <json>')
}
