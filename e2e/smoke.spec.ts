import { test, expect, type Page } from '@playwright/test'

// Jokainen launcherin kortti ja sen välilehdet. Lista on käsin kirjoitettu
// tarkoituksella: uusi näkymä joka ei ole tässä ei ole testattu, ja se on
// helpompi huomata puuttuvana rivinä kuin automaattisesti löydettynä.
//
// 'Talk to Friday' puuttuu, koska sillä ei ole näkymää. 'Käyttäjät' puuttuu,
// koska paikallisessa tilassa admin-työkalua ei myönnetä.
const TOOLS: { card: string; tabs: string[] }[] = [
  { card: 'Fitness Tracking', tabs: ['Tänään', 'Kalenteri', 'Paino', 'Analyysi'] },
  { card: 'Habit Tracking',   tabs: ['Tavat'] },
  { card: 'Wealth',           tabs: ['Wealth', 'Asetukset'] },
  { card: 'Workout',          tabs: ['Workout'] },
  { card: 'Grocery',          tabs: ['Grocery'] },
  { card: 'Suunnittelu',      tabs: ['Suunnittelu', 'Asetukset'] },
  { card: 'Tehtävät',         tabs: ['Tehtävät', 'Kalenteri'] },
  { card: 'LiikkuvuusPuu',    tabs: ['Liikkuvuus'] },
]

// Testi ei saa riippua verkosta eikä koskea mihinkään ulkoiseen. Google Fonts
// jumittaisi muuten `load`-tapahtuman eristetyssä ympäristössä, ja fontin
// puuttuminen ei ole se mitä tässä testataan.
test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!localhost[:/])/, (r) => r.abort())
})

const iso = (d: Date) => d.toISOString().slice(0, 10)
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86_400_000))

// Kolme viikkoa dataa riittää siihen, että trendi, TDEE-arvio ja analyysi
// laskevat jotain eivätkä vain näytä "tarvitaan lisää dataa" -tilaa. Moni
// kaatuminen syntyy vasta kun laskettavaa on.
function fixture() {
  const meals = []
  const weights = []
  for (let i = 21; i >= 1; i--) {
    meals.push({ id: 1000 + i, date: daysAgo(i), kcal: 2100 + (i % 3) * 150, protein: 160 })
    weights.push({ id: 2000 + i, date: daysAgo(i), kg: 75 - (21 - i) * 0.04, excludeFromTrend: false })
  }
  return {
    settings: {
      startDate: daysAgo(21),
      endDate: daysAgo(-21),
      startWeight: 75,
      targetWeight: 73,
      tdee: { rest: 2350, single: 2750, double: 3050, volleyball: 2750 },
      weeklyPattern: { 0: 'rest', 1: 'rest', 2: 'single', 3: 'rest', 4: 'double', 5: 'volleyball', 6: 'single' },
      proteinTarget: 170,
    },
    events: [],
    extras: [],
    meals,
    weights,
    burns: [],
    adjustments: [],
  }
}

/** Kerää kaatumiset. Konsolin `error` jätetään pois, koska paikallisessa tilassa
 *  osa pilvikutsuista raportoi sinne odotetusti — kaatumisen tunnistaa
 *  `pageerror`ista ja siitä, että React tyhjentää #rootin. */
function watchCrashes(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return errors
}

async function expectAlive(page: Page, where: string, errors: string[]) {
  // Ilman error boundarya renderöintivirhe irrottaa koko puun: #root jää
  // tyhjäksi ja puhelimessa näkyy musta ruutu.
  await expect(page.locator('#root > *').first(), `${where}: #root on tyhjä`).toBeVisible()
  expect(errors, `${where}: kaatui`).toEqual([])
}

test('käynnistyy tyhjällä datalla', async ({ page }) => {
  const errors = watchCrashes(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Työkalut' })).toBeVisible()
  await expectAlive(page, 'launcher', errors)
})

for (const seeded of [false, true]) {
  test(`jokainen näkymä piirtyy (${seeded ? 'datalla' : 'tyhjänä'})`, async ({ page }) => {
    if (seeded) {
      await page.addInitScript((data) => {
        if (!localStorage.getItem('cutdata:v1')) localStorage.setItem('cutdata:v1', JSON.stringify(data))
      }, fixture())
    }
    const errors = watchCrashes(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Työkalut' })).toBeVisible()

    for (const tool of TOOLS) {
      await page.getByRole('button', { name: tool.card, exact: true }).click()
      for (const tab of tool.tabs) {
        await page.getByRole('tab', { name: tab, exact: true }).click()
        await expect(page.getByRole('tab', { name: tab, exact: true })).toHaveAttribute('aria-selected', 'true')
        await expectAlive(page, `${tool.card} › ${tab}`, errors)
      }
      await page.getByRole('tab', { name: 'Koti', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Työkalut' })).toBeVisible()
    }
  })
}

test('paikallinen data säilyy uudelleenlatauksen yli', async ({ page }) => {
  // localStorage on monen työkalun ainoa totuus. Build joka "siivoaa" tai
  // migroi sen väärin on se virhe, jota rollback ei korjaa.
  const data = fixture()
  await page.addInitScript((d) => {
    if (!localStorage.getItem('cutdata:v1')) localStorage.setItem('cutdata:v1', JSON.stringify(d))
  }, data)
  const errors = watchCrashes(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Fitness Tracking', exact: true }).click()
  await page.getByRole('tab', { name: 'Paino', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Työkalut' })).toBeVisible()

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('cutdata:v1') ?? 'null'))
  expect(stored?.meals?.length, 'ateriat hävisivät').toBe(data.meals.length)
  expect(stored?.weights?.length, 'punnitukset hävisivät').toBe(data.weights.length)
  expect(stored?.settings?.tdee).toEqual(data.settings.tdee)
  await expectAlive(page, 'reload', errors)
})
