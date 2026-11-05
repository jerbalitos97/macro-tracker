import { defineConfig, devices } from '@playwright/test'

// Savutestit — se turvaverkko jonka varassa automaatio saa julkaista.
//
// Ne eivät todista että ominaisuus toimii oikein. Ne todistavat että sovellus
// käynnistyy, jokainen näkymä piirtyy kaatumatta ja paikallinen data säilyy
// uudelleenlatauksen yli. Juuri ne kolme asiaa, joiden rikkoutuminen tekee
// sovelluksesta käyttökelvottoman puhelimella ilman että kukaan huomaa ennen
// seuraavaa kirjausta.
//
// Ajetaan tuotantobuildia vastaan (`vite preview`), ei dev-palvelinta: bugit
// jotka syntyvät vasta minifioinnissa tai chunkituksessa näkyvät vain siellä.
// Supabase-muuttujat tyhjennetään, jolloin sovellus käynnistyy paikallisessa
// tilassa — ei kirjautumista, kaikki työkalut auki, ei verkkoa oikeaan kantaan.
// Testit eivät siis koskaan kirjoita tuotantodataan.
//
// Build menee omaan hakemistoonsa, jotta testiajo ei ylikirjoita `dist/`iä.

const PORT = 4173
const OUT = 'node_modules/.smoke-dist'

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'node_modules/.playwright-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Service worker välimuistittaisi edellisen ajon buildin ja testi
    // katsoisi väärää versiota.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  // Puhelin, koska sovellus on puhelinsovellus — leveällä ruudulla osa
  // asettelubugeista ei koskaan laukea.
  //
  // Paikallisesti käytetään koneen omaa Chromea: Playwrightin oma Chromium-
  // binääri kaatuu tällä macOS-versiolla heti käynnistyessään. CI:ssä (Linux)
  // käytetään Playwrightin omaa, jotta ajo ei riipu runnerin Chrome-versiosta.
  projects: [{
    name: 'iphone',
    use: { ...devices['iPhone 13'], browserName: 'chromium', channel: process.env.CI ? undefined : 'chrome' },
  }],
  webServer: {
    command: `vite build --outDir ${OUT} --emptyOutDir && vite preview --outDir ${OUT} --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
  },
})
