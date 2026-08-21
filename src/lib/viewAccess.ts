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

  today:            'fitness',
  calendar:         'fitness',
  weight:           'fitness',
  analysis:         'fitness',

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
