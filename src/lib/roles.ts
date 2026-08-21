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
  wealth:   'Wealth',
  workout:  'Workout',
  grocery:  'Grocery',
  plan:     'Suunnittelu',
  friday:   'Talk to Friday',
  tasks:    'Tehtävät',
  mobility: 'LiikkuvuusPuu',
  admin:    'Käyttäjäoikeudet',
}

/** Työkalut jotka admin voi myöntää. `admin` ei ole listalla: admin-oikeus
 *  tulee `app_users.is_admin`-lipusta, ei työkalulistasta, jotta oikeuden
 *  myöntämiselle on yksi reitti eikä kaksi. */
export const ASSIGNABLE_TOOLS: Tool[] = ALL_TOOLS.filter((t) => t !== 'admin')

/** Mitä uusi käyttäjä näkee ennen kuin admin on konffannut hänelle mitään.
 *  Tarkoituksellisen suppea: Kodista tuodut työkalut ovat ne joita muut kuin
 *  omistaja tulevat käyttämään, eikä paino- tai varallisuusdataan pääse
 *  vahingossa se joka ehtii kirjautua ennen konffausta. */
const DEFAULT_TOOLS: Tool[] = ['tasks', 'mobility']

/** Adminin oletukset — kaikki. Käytetään vain jos admin-käyttäjän oma
 *  oikeusrivi puuttuu, jotta konffaamaton kanta ei lukitse ulos. */
const ADMIN_TOOLS: Tool[] = ALL_TOOLS

export function defaultToolsFor(isAdmin: boolean): Tool[] {
  return isAdmin ? [...ADMIN_TOOLS] : [...DEFAULT_TOOLS]
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
  const base = override ?? defaultToolsFor(isAdmin)
  if (isAdmin) {
    return base.includes('admin') ? base : [...base, 'admin']
  }
  return base.filter((t) => t !== 'admin')
}
