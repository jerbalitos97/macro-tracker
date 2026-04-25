# Makrot – kaloriseuranta

Mobiili-ensimmäinen PWA kalorien ja painon seurantaan cut-jaksolle. Toimii selaimen kotinäytöllä kuten natiivisovellus.

## Ominaisuudet

- Päivittäinen kaloribudjetti päivätyypin mukaan (lepo / 1 treeni / 2 treeniä / volleyball)
- Juhlapäivien hallinta pre/post-bufferilla
- Ekstratreenien lisäys budjettiin
- 7 pv liukuva painotrendi + TDEE-estimaatin korjausehdotukset
- Kaikki data tallennetaan `localStorage`-muistiin (ei tietokantaa, ei backendiä)
- Toimii offline (service worker)

## Kehitys

```sh
npm install
node scripts/gen-icons.mjs   # luo kuvakkeet public/icons/
npm run dev
```

Avaa selaimessa: http://localhost:5173

## Tuotantorakennus

```sh
npm run build
# tulostaa: dist/
```

## Kuvakkeiden generointi

```sh
node scripts/gen-icons.mjs
```

Generoi `public/icons/icon-192.png` ja `public/icons/icon-512.png` ilman ulkoisia riippuvuuksia.
Voit korvata nämä omilla PNG-tiedostoilla (192×192 ja 512×512).

## iPhone-kotinäyttö

1. Avaa sovellus Safarissa
2. Jaa-painike → "Lisää kotinäyttöön"
3. Sovellus käynnistyy koko näytöllä ilman selaimen osoitepalkkia

## Stack

- Vite 6 + React 18 + TypeScript
- Lucide React (ikonit)
- localStorage (pysyvyys)
- Manuaalinen service worker (offline)
- Inline CSS-objektit (ei CSS-kirjastoja)

## Kansiorakenne

```
src/
  types/       – kaikki TypeScript-tyypit
  lib/         – bisneslogiikka (laskenta, tallennus, päivämäärät, paino)
  hooks/       – ei käytössä (hook-valmius)
  styles/      – tokens.ts (tyylit) + global.css
  components/  – uudelleenkäytettävät UI-komponentit
  views/       – päänäkymät (Tänään, Kalenteri, Paino, Trendit, Asetukset)
  App.tsx      – juuri; tila + tallennus
  main.tsx     – ReactDOM + SW-rekisteröinti
```
