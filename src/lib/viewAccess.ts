import type { View } from '../components/NavBar'
import type { Tool } from './roles'

// Mikä työkalu mikä näkymä on.
//
// Tämä taulukko on se paikka joka pitää muistaa päivittää kun näkymä lisätään.
// `Record<View, …>` on tarkoituksellinen: uusi View-arvo rikkoo käännöksen
// kunnes se on tässä, jotta näkymä ei pääse tuotantoon oikeuksien ulkopuolelle.
//
// `null` = aina auki. Vain kaksi näkymää on sellaisia: launcher, ja asetukset
// jossa on uloskirjautuminen ja oman datan varmuuskopio. Jos asetukset olisi
// portitettu, väärä rasti voisi jättää käyttäjän sisään ilman ulospääsyä.
export const VIEW_TOOL: Record<View, Tool | null> = {
  home:             null,
  settings:         null,

  // Fitness on jaettu: `fitness:core` on kalorit, kalenteri ja analyysi,
  // `fitness:weight` on painonseuranta. Alatyökalu esiintyy tehollisessa
  // listassa vain kun `fitness` on myönnetty (ks. roles.ts normalizeTools),
  // joten yksi avain riittää eikä emoa tarvitse tarkistaa erikseen.
  today:            'fitness:core',
  calendar:         'fitness:core',
  analysis:         'fitness:core',
  weight:           'fitness:weight',

  habits:           'habits',
  wealth:           'wealth',
  'wealth-settings': 'wealth',
  workout:          'workout',
  grocery:          'grocery',
  planning:         'plan',

  tasks:            'tasks',
  'tasks-calendar': 'tasks',
  mobility:         'mobility',
  admin:            'admin',
}

export function isViewAllowed(view: View, tools: Tool[]): boolean {
  const needed = VIEW_TOOL[view]
  return needed === null || tools.includes(needed)
}
