// Grocery auto-categorisation + per-store section ordering.
//
// Sections mirror the REAL chain departments (not a fixed 8), and each store's
// ORDER follows that chain's online-shop taxonomy:
//   - S-kaupat   (s-kaupat.fi)
//   - K-Ruoka    (k-ruoka.fi)
//   - Lidl       (lidl.fi)
// Items classify by name into these departments; the section order changes
// with the selected store. Editable per item in the UI.

export type CategoryKey =
  | 'hedelmat' | 'leipa' | 'liha' | 'kala' | 'valmis' | 'maito'
  | 'kuiva' | 'sailyke' | 'mausteet' | 'pakaste' | 'makeiset' | 'juomat' | 'muut'

export const CATEGORY_LABEL: Record<CategoryKey, string> = {
  hedelmat: 'Hedelmät ja vihannekset',
  leipa:    'Leivät ja leivonnaiset',
  liha:     'Liha ja kasviproteiinit',
  kala:     'Kala ja merenelävät',
  valmis:   'Valmisruoka',
  maito:    'Maito, juusto ja munat',
  kuiva:    'Kuivatuotteet ja leivonta',
  sailyke:  'Säilykkeet ja ateria-ainekset',
  mausteet: 'Öljyt, mausteet ja kastikkeet',
  pakaste:  'Pakasteet',
  makeiset: 'Makeiset ja naposteltavat',
  juomat:   'Juomat',
  muut:     'Muut',
}

export type StoreKey = 's' | 'k' | 'lidl'

export const STORE_LABEL: Record<StoreKey, string> = {
  s:    'S-market',
  k:    'K-Market',
  lidl: 'Lidl',
}

// Section order = the chain's own webshop taxonomy order.
export const STORE_ORDER: Record<StoreKey, CategoryKey[]> = {
  // s-kaupat.fi
  s: ['hedelmat', 'leipa', 'liha', 'kala', 'valmis', 'maito', 'pakaste', 'kuiva', 'sailyke', 'mausteet', 'juomat', 'makeiset', 'muut'],
  // k-ruoka.fi
  k: ['hedelmat', 'leipa', 'liha', 'kala', 'valmis', 'maito', 'kuiva', 'sailyke', 'mausteet', 'pakaste', 'makeiset', 'juomat', 'muut'],
  // lidl.fi
  lidl: ['hedelmat', 'leipa', 'liha', 'kala', 'maito', 'valmis', 'pakaste', 'kuiva', 'sailyke', 'mausteet', 'makeiset', 'juomat', 'muut'],
}

// Map the original 8-category keys onto the new departments so items saved
// before this change still render under the right section.
const LEGACY_ALIAS: Record<string, CategoryKey> = {
  hedelmat: 'hedelmat',
  lihat: 'liha',
  maitotuotteet: 'maito',
  juomat: 'juomat',
  herkut: 'makeiset',
  mausteet: 'mausteet',
  kuivaaineet: 'kuiva',
  muut: 'muut',
}

export function normalizeCategory(c: string): CategoryKey {
  if (c in CATEGORY_LABEL) return c as CategoryKey
  if (c in LEGACY_ALIAS) return LEGACY_ALIAS[c]
  return 'muut'
}

// Keyword → department, evaluated in PRIORITY order (first hit wins). Override-y
// departments come first so e.g. maitosuklaa→Makeiset, kalamata-oliivit→Mausteet,
// tomaattimurska→Säilykkeet, kananmuna→Maito (not Liha).
const PRIORITY: CategoryKey[] = [
  'makeiset', 'mausteet', 'sailyke', 'maito', 'kala', 'liha',
  'juomat', 'leipa', 'pakaste', 'valmis', 'kuiva', 'hedelmat',
]

const KEYWORDS: Record<Exclude<CategoryKey, 'muut'>, string[]> = {
  makeiset: [
    'karkki', 'makeinen', 'namu', 'suklaa', 'patukka', 'sipsi', 'lastu', 'naks',
    'popcorn', 'keksi', 'pikkuleip', 'vohveli', 'jäätel', 'lakritsi', 'salmiakki',
    'snack', 'pähkin',
  ],
  mausteet: [
    'öljy', 'oliivi', 'etikka', 'mauste', 'suola', 'pippuri', 'kastike', 'ketsuppi',
    'ketchup', 'sinappi', 'majoneesi', 'majo', 'sriracha', 'soijakast', 'salsa',
    'curry', 'paprikajauhe', 'chilijauhe', 'chilirouhe', 'kurkuma', 'kaneli',
    'korianteri', 'oregano', 'basilika', 'timjami', 'rosmariini', 'cajun', 'fondi',
    'liemikuutio', 'salaatinkast', 'balsamico', 'dippijauhe', 'dippi', 'pesto',
  ],
  sailyke: [
    'säilyke', 'tomaattimurska', 'tomaattisose', 'tomaattipyree', 'kikherne', 'linssi',
    'keitto', 'kookosmaito', 'maissisäilyke', 'tonnikalasäilyke',
  ],
  maito: [
    'maito', 'piimä', 'kerma', 'smetana', 'juusto', 'edam', 'emmental', 'gouda',
    'mozzarella', 'feta', 'parmesan', 'raejuusto', 'tuorejuusto', 'jogurtti',
    'jugurtti', 'rahka', 'viili', 'voi ', 'margariini', 'levite', 'oltermanni',
    'kananmuna', 'muna', 'munat',
  ],
  kala: [
    'kala', 'lohi', 'kirjolohi', 'seiti', 'tonnikala', 'silli', 'muikku', 'nieriä',
    'makrilli', 'katkarapu', 'mäti', 'surimi', 'anjovis', 'simpukka',
  ],
  liha: [
    'liha', 'jauheliha', 'jauhis', 'nauta', 'possu', 'sika', 'porsas', 'kana',
    'broiler', 'kalkkuna', 'makkara', 'nakki', 'pekoni', 'kinkku', 'leike', 'pihvi',
    'filee', 'kassler', 'lammas', 'poro', 'tofu', 'nyhtö', 'härkis', 'härkäpapu',
    'seitan', 'falafel', 'soijarouhe',
  ],
  juomat: [
    'mehu', 'limu', 'limsa', 'virvoitus', 'cola', 'kokis', 'pepsi', 'jaffa', 'vesi',
    'kivennäis', 'vichy', 'kahvi', 'tee ', 'kaakaojuoma', 'energiajuoma', 'smoothie',
    'olut', 'lager', 'siideri', 'lonkero', 'viini', 'kuohuviini', 'samppanja', 'juoma',
    'kombucha', 'gin', 'vodka', 'viski',
  ],
  leipa: [
    'leipä', 'sämpyl', 'näkkileip', 'ruisleip', 'paahtoleip', 'patonki', 'rieska',
    'rinkeli', 'tortilla', 'pitaleip', 'ruispalat', 'korppu', 'croissant',
  ],
  pakaste: [
    'pakaste', 'pakastemarja', 'pakastevihannes', 'ranskalaiset', 'nugget', 'kalapuikko',
  ],
  valmis: [
    'valmisruoka', 'eines', 'pizza', 'lasagne', 'wokki', 'gratiini',
  ],
  kuiva: [
    'riisi', 'pasta', 'spagetti', 'makaroni', 'nuudeli', 'couscous', 'bulgur', 'jauho',
    'vehnä', 'sokeri', 'hiiva', 'leivinjauhe', 'ruokasooda', 'kaurahiutale', 'hiutale',
    'mysli', 'muro', 'puuro', 'hillo', 'hunaja', 'manteli', 'rusina', 'taateli',
    'kookos', 'siemen', 'vaniljasokeri', 'kaakaojauhe', 'leseet', 'pellava', 'chia',
    'kvinoa', 'korppujauho',
  ],
  hedelmat: [
    'omena', 'banaani', 'appelsiini', 'sitruuna', 'lime', 'mandariini', 'päärynä',
    'rypäle', 'mango', 'ananas', 'kiivi', 'persikka', 'luumu', 'marja', 'mansik',
    'mustikka', 'vadelma', 'puolukka', 'tomaatti', 'kurkku', 'paprika', 'peruna',
    'porkkana', 'sipuli', 'valkosipuli', 'salaatti', 'pinaatti', 'parsakaali',
    'kukkakaali', 'kaali', 'lanttu', 'nauris', 'bataatti', 'avokado', 'sieni',
    'retiisi', 'selleri', 'fenkoli', 'parsa', 'maissi', 'kesäkurpitsa', 'munakoiso',
    'lehtikaali', 'rucola', 'vihannes', 'hedelmä', 'tilli', 'ruohosipuli', 'minttu',
    'inkivääri', 'chili',
  ],
}

export function classify(name: string): CategoryKey {
  const n = ` ${name.toLowerCase().trim()} `
  for (const cat of PRIORITY) {
    const kws = KEYWORDS[cat as Exclude<CategoryKey, 'muut'>]
    if (kws.some((k) => n.includes(k))) return cat
  }
  return 'muut'
}
