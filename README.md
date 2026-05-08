# Makrot – kaloriseuranta

Mobiili-ensimmäinen PWA kalorien ja painon seurantaan cut-jaksolle. Toimii iPhonen kotinäytöllä kuten natiivisovellus. Pilvisynkronointi Supabasen kautta (valinnainen).

## Ominaisuudet

- Päivittäinen kaloribudjetti päivätyypin mukaan (lepo / 1 treeni / 2 treeniä / volleyball)
- Juhlapäivien hallinta pre/post-bufferilla
- Ekstratreenien lisäys budjettiin
- 7 pv liukuva painotrendi + TDEE-estimaatin korjausehdotukset
- **Tavoiteanalyysi:** tavoitelinja vs. trendilinja, suositus, projisoidut päivämäärät
- Pilvisynkronointi Supabasen kautta (sähköposti-OTP-kirjautuminen)
- Toimii offline (service worker)
- Export/import JSON-varmuuskopio

---

## Kehitys

```sh
npm install
node scripts/gen-icons.mjs   # luo kuvakkeet public/icons/
npm run dev                  # http://localhost:5173
npm run build                # tuotantobuildi → dist/
```

### Ympäristömuuttujat (valinnainen – vain Supabasea varten)

```sh
cp .env.example .env.local
# täytä VITE_SUPABASE_URL ja VITE_SUPABASE_ANON_KEY
```

Ilman näitä muuttujia sovellus toimii normaalisti paikallisessa tilassa (localStorage, ei kirjautumista).

---

## Supabase-asennus

1. Luo ilmainen projekti osoitteessa [supabase.com](https://supabase.com)
2. Aja `supabase/schema.sql` SQL-editorissa (Project → SQL Editor → New query → liitä sisältö → Run)
3. Kopioi projektin URL ja anon key (Project Settings → API)
4. Lisää ne `.env.local`-tiedostoon tai Vercel-ympäristömuuttujiin (ks. alla)

### Taulut

| Taulu | Kuvaus |
|---|---|
| `settings` | Käyttäjän asetukset (JSONB, yksi rivi per käyttäjä) |
| `meals` | Ateriamerkinnät |
| `weight_entries` | Painomerkinnät |
| `training_burns` | Treenikulutukset |
| `special_events` | Erityistapahtumat + bufferit |
| `extra_workouts` | Ekstratreenit |

Kaikissa tauluissa on Row Level Security — käyttäjä näkee vain oman datansa.

---

## Deployment (Vercel)

Projekti on jo kytketty Verceliin (`jerbalitos97/macro-tracker`). Push `main`-haaraan käynnistää automaattisen deploymentin.

### Lisää ympäristömuuttujat Verceliin

1. [vercel.com](https://vercel.com) → projekti → **Settings → Environment Variables**
2. Lisää kaksi muuttujaa:
   - `VITE_SUPABASE_URL` = `https://xxx.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `eyJ...`
3. Deployaa uudelleen (tai push uusi commit)

### Build-asetukset (jo konfiguroidut)

| Asetus | Arvo |
|---|---|
| Build command | `npm run build` |
| Output directory | `dist` |
| Framework | Vite |

---

## Migraatio: paikallisesta datasta pilveen

Kun kirjaudut sisään ensimmäistä kertaa:

1. Sovellus hakee datan Supabasesta
2. Jos pilvi on tyhjä mutta paikallista dataa löytyy, näytetään migraatiobanneri
3. Klikkaa **"Siirrä pilveen"** → kaikki localStorage-data lähetetään Supabaseen
4. Jatkossa Supabase on tiedon lähde; localStorage toimii välimuistina

Jos ohitat migraation, pilvi käynnistyy tyhjänä. Voit silti viedä paikallisen datan JSON-varmuuskopioksi (Asetukset → Varmuuskopio).

---

## Tavoiteanalyysi – laskentalogiikka

**Tavoitelinja** on lineaarinen viiva cut-jakson alusta (lähtöpaino) loppuun (tavoitepaino).

**Trendilinja** on 7 päivän liukuva keskiarvo kirjatuista painoista. Tämä tasoittaa vesipainon päivittäisen vaihtelun, jotta ohimenevät nousut tai laskut eivät aiheuta virheellisiä hälytyksiä.

### Laskukaavat

```
Jäljellä oleva pudotus  = trendipainon nykyarvo − tavoitepaino
Vaadittu kokonaisvaje   = jäljellä oleva pudotus × 7 700 kcal
Vaadittu päivävaje      = vaadittu kokonaisvaje ÷ jäljellä olevat päivät
Vaadittu viikkotahti    = (vaadittu päivävaje × 7) ÷ 7 700  (kg/vk)

Todellinen viikkotahti  = trendin viikkomuutos (kg/vk)
Todellinen päivävaje    = |viikkotahti| × 7 700 ÷ 7  (kcal/pv)

Ero                     = vaadittu päivävaje − todellinen päivävaje
  positiivinen ero      → jäljessä tahdista
  negatiivinen ero      → edellä tahdista
```

### Suositustaulukko

| Ero (kcal/pv) | Suositus |
|---|---|
| ≤ ±100 | Oikealla radalla – jatka samaan malliin |
| +100 … +300 | Hieman jäljessä – pienennä hieman |
| > +300 | Selkeästi jäljessä – tarvitaan muutos |
| < −100 | Edellä tavoitetta – voit löystää |

### Projisoidun päättymispäivän laskenta

```
Viikkoja jäljellä = (trendipainon nykyarvo − tavoitepaino) ÷ |viikkomuutos|
Arvioitu päivä    = tänään + (viikkoja jäljellä × 7)
```

Jos viikkomuutos on lähellä nollaa (< 0,01 kg/vk), projisoitua päivää ei näytetä.

---

## PWA-päivitykset

Service worker (`sw.js`) käyttää:
- **Network-first** `index.html`-tiedostolle → uusi deploy näkyy seuraavalla latauksella
- **Cache-first** hajastetuille JS/CSS-tiedostoille → nopea lataus, eikä vanhentuneita tiedostoja

Kun uusi service worker aktivoituu (`skipWaiting` + `clients.claim`), sivu latautuu automaattisesti uudelleen (`controllerchange`-tapahtuma `main.tsx`:ssä).

Välimuistinimi: `makrot-v3` — päivitä tätä tarvittaessa pakottaaksesi tyhjennyksen.

---

## Rajoitukset

- **Offline-tilassa tehdyt muutokset** tallennetaan localStorageen mutta **eivät synkronoidu automaattisesti** Supabaseen yhteyden palatessa. Synkronointi tapahtuu vasta seuraavalla latauksella kirjautuneena tilassa.
- **Laitekohtaisuus:** Ilman Supabasea data on vain kyseisessä selaimessa.
- **Yksi käyttäjä per selain:** Ei tukea useammalle tilille samalla laitteella.
