// Työkaluoikeudet. Kattaa KAIKKI Fridayn työkalut, ei vain Kodista tuotuja —
// muuten uusi työkalu on oikeuksien ulkopuolella siihen asti että joku muistaa
// lisätä sen, ja "ulkopuolella" tarkoittaa käytännössä "näkyy kaikille".
//
// Miksi oletukset ovat koodissa vaikka CLAUDE.md sanoo että sisältö kuuluu
// kantaan: nämä eivät ole sisältöä vaan varautuminen siihen että riviä ei ole.
// Käyttäjän oikeusrivi voi puuttua (uusi tili, ensimmäinen kirjautuminen ennen
// kuin admin on ehtinyt konffata), ja jokin arvo on silloin pakko valita. Sama
// anti-footgun kuin Kodin roles.ts:ssä. Todellinen konfiguraatio elää
// `user_tools`-taulussa ja voittaa nämä aina.

export type Tool =
  // Fridayn omat
  | 'habits'
  | 'fitness'
  // Fitnessin alatyökalut. Näkyvät vain kun `fitness` on myönnetty, ja
  // jakavat sen sisällön kolmeen osaan — ks. FITNESS_SUB_TOOLS.
  | 'fitness:weight'
  | 'fitness:core'
  | 'fitness:photo'
  | 'wealth'
  | 'workout'
  | 'grocery'
  | 'plan'
  | 'friday'
  // Kodista tuodut
  | 'tasks'
  | 'mobility'
  // Hallinta
  | 'admin'

/** Kaikki tunnetut työkalut. Järjestys on admin-näkymän listajärjestys. */
export const ALL_TOOLS: Tool[] = [
  'habits',
  'fitness',
  'fitness:weight',
  'fitness:core',
  'fitness:photo',
  'wealth',
  'workout',
  'grocery',
  'plan',
  'friday',
  'tasks',
  'mobility',
  'admin',
]

export const TOOL_NAMES: Record<Tool, string> = {
  habits:   'Habit Tracking',
  fitness:  'Fitness Tracking',
  'fitness:weight': 'Painonseuranta',
  'fitness:core':   'Kaikki muu paitsi painonseuranta',
  'fitness:photo':  'Kuvauslisä kalorienseurantaan',
  wealth:   'Wealth',
  workout:  'Workout',
  grocery:  'Grocery',
  plan:     'Suunnittelu',
  friday:   'Talk to Friday',
  tasks:    'Tehtävät',
  mobility: 'LiikkuvuusPuu',
  admin:    'Käyttäjäoikeudet',
}

/** Fitnessin alatyökalut siinä järjestyksessä kuin ne näytetään adminissa. */
export const FITNESS_SUB_TOOLS: Tool[] = ['fitness:weight', 'fitness:core', 'fitness:photo']

const SUB_TOOL_SET = new Set<Tool>(FITNESS_SUB_TOOLS)

/** Onko työkalu jonkin toisen alatyökalu. Adminissa nämä piirretään emonsa
 *  sisään eikä omina korttiriveinään. */
export const isSubTool = (t: Tool): boolean => SUB_TOOL_SET.has(t)

/** Työkalut jotka admin voi myöntää. `admin` ei ole listalla: admin-oikeus
 *  tulee `app_users.is_admin`-lipusta, ei työkalulistasta, jotta oikeuden
 *  myöntämiselle on yksi reitti eikä kaksi. */
export const ASSIGNABLE_TOOLS: Tool[] = ALL_TOOLS.filter((t) => t !== 'admin')

/** Ylätason työkalut — se lista jota admin selaa. */
export const PARENT_TOOLS: Tool[] = ASSIGNABLE_TOOLS.filter((t) => !isSubTool(t))

/**
 * Alatyökalujen säännöt yhdessä paikassa.
 *
 *   · Kuvalisä vaatii ydintyökalun. Kuvasta tunnistettu annos kirjataan
 *     ruokapäiväkirjaan, ja ilman ydintä ei ole päiväkirjaa mihin kirjata —
 *     pelkkä kuvalisä olisi nappi joka ei johda mihinkään.
 *   · Painonseuranta ja ydin ovat toisistaan riippumattomia. Molemmat päällä
 *     on nykyinen Fitness kokonaisuudessaan; vain painonseuranta on se
 *     kevyt versio jossa ei ole kaloreita eikä tavoiteanalyysiä.
 *   · Yksikään alatyökalu ei tarkoita mitään ilman emoaan. Jos `fitness` ei
 *     ole myönnetty, alatyökalut pudotetaan.
 *
 * Tätä kutsutaan sekä ajonaikaisessa resoluutiossa että adminin rastituksessa,
 * jotta kannassa oleva epäjohdonmukainen rivi ei koskaan avaa mitään mitä
 * säännöt eivät salli.
 */
export function normalizeTools(tools: Tool[]): Tool[] {
  const set = new Set(tools)

  if (!set.has('fitness')) {
    for (const sub of FITNESS_SUB_TOOLS) set.delete(sub)
    return ALL_TOOLS.filter((t) => set.has(t))
  }

  // Kuvalisä ⇒ ydin.
  if (set.has('fitness:photo')) set.add('fitness:core')

  // `fitness` ilman yhtään alavalintaa on vanha muoto (ja se mitä admin saa
  // kun myöntää pelkän Fitnessin). Tulkitaan se koko nykyiseksi työkaluksi,
  // jotta myöntäminen ei tuota korttia jonka takana ei ole mitään.
  if (!FITNESS_SUB_TOOLS.some((sub) => set.has(sub))) {
    set.add('fitness:core')
    set.add('fitness:weight')
  }

  return ALL_TOOLS.filter((t) => set.has(t))
}

/** Mitä uusi käyttäjä näkee ennen kuin admin on konffannut hänelle mitään.
 *
 *  Päätetty oletus: LiikkuvuusPuu, Tehtävät ja ruokapäiväkirja. Ruoka puuttuu
 *  tästä listasta koska sitä työkalua ei ole vielä olemassa — Fridayn
 *  ruokakirjaus elää `fitness`-työkalun sisällä TDEE:n, vajeen ja
 *  tavoiteanalyysin kanssa, eikä sitä voi myöntää erikseen ennen kuin se on
 *  eriytetty omaksi työkaluksi. Lisää `'ruoka'` tähän samalla kun se tehdään.
 *
 *  Suppeus on tarkoituksellista: paino- tai varallisuusdataan ei pääse
 *  vahingossa se joka ehtii kirjautua ennen kuin admin on konffannut. */
const DEFAULT_TOOLS: Tool[] = ['tasks', 'mobility']

/** Adminin oletukset — kaikki. Käytetään vain jos admin-käyttäjän oma
 *  oikeusrivi puuttuu, jotta konffaamaton kanta ei lukitse ulos. */
const ADMIN_TOOLS: Tool[] = ALL_TOOLS

export function defaultToolsFor(isAdmin: boolean): Tool[] {
  return normalizeTools(isAdmin ? [...ADMIN_TOOLS] : [...DEFAULT_TOOLS])
}

const isTool = (v: string): v is Tool => (ALL_TOOLS as string[]).includes(v)

/** Siivoaa kannasta tulleen text[]-listan tyypitetyksi. Tuntemattomat arvot
 *  pudotetaan — poistettu työkalu jää riveille roikkumaan, eikä sen nimen
 *  osuminen johonkin uuteen saa avata mitään. */
export function parseTools(raw: unknown): Tool[] | null {
  if (!Array.isArray(raw)) return null
  return raw.filter((v): v is Tool => typeof v === 'string' && isTool(v))
}

/**
 * Lopullinen työkalulista. `override` on kannan rivi tai null jos riviä ei ole.
 *
 * Kaksi anti-footgunia:
 *   · admin saa aina `admin`-työkalun, vaikka rivi sanoisi muuta — muuten yksi
 *     väärä rasti lukitsee ulos admin-näkymästä;
 *   · muu kuin admin ei saa `admin`-työkalua koskaan, vaikka rivi sanoisi niin.
 *     Tämä on vain käyttöliittymän puoli; kannassa saman asian tekee RLS.
 */
export function effectiveTools(isAdmin: boolean, override: Tool[] | null): Tool[] {
  const base = normalizeTools(override ?? defaultToolsFor(isAdmin))
  if (isAdmin) {
    return base.includes('admin') ? base : [...base, 'admin']
  }
  return base.filter((t) => t !== 'admin')
}
