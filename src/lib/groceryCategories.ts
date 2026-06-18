// Grocery auto-categorisation + per-store section ordering.
//
// The 8 fixed sections come from the user's spec. The per-store ORDER mirrors
// the typical walking route through each Finnish chain, derived from their
// online-store taxonomies (s-kaupat.fi, k-ruoka.fi, lidl.fi). Items always
// classify into the same 8 buckets by name; only the section order changes
// with the store. Categories are approximations of real layouts — editable
// per item in the UI.

export type CategoryKey =
  | 'hedelmat' | 'lihat' | 'maitotuotteet' | 'juomat'
  | 'herkut' | 'mausteet' | 'kuivaaineet' | 'muut'

export const CATEGORY_LABEL: Record<CategoryKey, string> = {
  hedelmat:     'Hedelmät ja vihannekset',
  lihat:        'Lihat',
  maitotuotteet:'Maitotuotteet',
  juomat:       'Juomat',
  herkut:       'Herkut',
  mausteet:     'Mausteet',
  kuivaaineet:  'Kuiva-aineet',
  muut:         'Muut',
}

export type StoreKey = 's' | 'k' | 'lidl'

export const STORE_LABEL: Record<StoreKey, string> = {
  s:    'S-market',
  k:    'K-Market',
  lidl: 'Lidl',
}

// Order = the sequence you walk the sections in that chain (entrance → checkout).
export const STORE_ORDER: Record<StoreKey, CategoryKey[]> = {
  // S: produce → bakery/dry → meat → dairy → spices → drinks → sweets
  s:    ['hedelmat', 'kuivaaineet', 'lihat', 'maitotuotteet', 'mausteet', 'juomat', 'herkut', 'muut'],
  // K: produce → meat → dairy → dry → spices → drinks → sweets
  k:    ['hedelmat', 'lihat', 'maitotuotteet', 'kuivaaineet', 'mausteet', 'juomat', 'herkut', 'muut'],
  // Lidl: produce → dry/bakery → meat → dairy → drinks → sweets → spices
  lidl: ['hedelmat', 'kuivaaineet', 'lihat', 'maitotuotteet', 'juomat', 'herkut', 'mausteet', 'muut'],
}

// Keyword → category. Evaluated in PRIORITY order (first hit wins), so more
// "override-y" categories (sweets, spices, dairy) are checked before broad
// ones (meat, drinks, produce) to avoid mis-hits like maitosuklaa→Herkut,
// kananmuna→Maitotuotteet, omenamehu→Juomat.
const PRIORITY: CategoryKey[] = [
  'herkut', 'mausteet', 'maitotuotteet', 'lihat', 'juomat', 'hedelmat', 'kuivaaineet',
]

const KEYWORDS: Record<Exclude<CategoryKey, 'muut'>, string[]> = {
  herkut: [
    'karkki', 'makeinen', 'namu', 'suklaa', 'patukka', 'sipsi', 'lastu', 'naksu',
    'popcorn', 'keksi', 'pikkuleip', 'vohveli', 'jäätel', 'jätski', 'kakku', 'pulla',
    'donitsi', 'munkki', 'lakritsi', 'salmiakki', 'snack', 'dipp', 'pähkin', 'maustepähkin',
  ],
  mausteet: [
    'suola', 'pippuri', 'mauste', 'curry', 'paprikajauhe', 'chilijauhe', 'kurkuma',
    'kaneli', 'korianteri', 'kumina', 'basilika', 'oregano', 'timjami', 'rosmariini',
    'yrtti', 'persilja', 'tilli', 'sinappi', 'ketsuppi', 'ketchup', 'majoneesi', 'majo',
    'kastike', 'soijakast', 'salsa', 'öljy', 'etikka', 'balsamico', 'liemikuutio', 'fondi',
    'tomaattisose', 'tomaattimurska', 'tomaattipyree',
  ],
  maitotuotteet: [
    'maito', 'piimä', 'kerma', 'kermaviili', 'smetana', 'juusto', 'edam', 'emmental',
    'gouda', 'mozzarella', 'feta', 'raejuusto', 'tuorejuusto', 'jogurtti', 'jugurtti',
    'rahka', 'viili', 'voi ', 'margariini', 'levite', 'oltermanni', 'aura', 'kananmuna',
    'muna', 'munat',
  ],
  lihat: [
    'jauheliha', 'nauta', 'possu', 'sika', 'porsas', 'kana', 'broiler', 'kalkkuna',
    'makkara', 'nakki', 'pekoni', 'kinkku', 'leike', 'pihvi', 'filee', 'fileet',
    'lihapull', 'liha', 'kassler', 'lammas', 'poro', 'lohi', 'kirjolohi', 'seiti',
    'tonnikala', 'silli', 'katkarapu', 'kala', 'tofu', 'nyhtö', 'härkis', 'härkäpapu',
    'seitan', 'falafel', 'soijarouhe',
  ],
  juomat: [
    'mehu', 'limu', 'limsa', 'virvoitus', 'cola', 'kokis', 'pepsi', 'jaffa', 'vesi',
    'kivennäis', 'vichy', 'kahvi', 'tee', 'kaakaojuoma', 'energiajuoma', 'smoothie',
    'olut', 'lager', 'siideri', 'lonkero', 'viini', 'kuohuviini', 'samppanja', 'juoma',
    'kombucha', 'gin', 'vodka', 'viski',
  ],
  hedelmat: [
    'omena', 'banaani', 'appelsiini', 'sitruuna', 'lime', 'mandariini', 'päärynä',
    'rypäle', 'mango', 'ananas', 'kiivi', 'persikka', 'luumu', 'marja', 'mansikka',
    'mustikka', 'vadelma', 'puolukka', 'tomaatti', 'kurkku', 'paprika', 'peruna',
    'porkkana', 'sipuli', 'valkosipuli', 'salaatti', 'pinaatti', 'parsakaali',
    'kukkakaali', 'kaali', 'lanttu', 'nauris', 'bataatti', 'avokado', 'sieni',
    'retiisi', 'selleri', 'fenkoli', 'parsa', 'maissi', 'kesäkurpitsa', 'munakoiso',
    'lehtikaali', 'rucola', 'vihannes', 'hedelmä', 'sitruuna', 'minttu', 'inkivääri',
  ],
  kuivaaineet: [
    'riisi', 'pasta', 'spagetti', 'makaroni', 'nuudeli', 'couscous', 'bulgur', 'jauho',
    'sokeri', 'hiiva', 'leivinjauhe', 'ruokasooda', 'kaurahiutale', 'hiutale', 'mysli',
    'muro', 'puuro', 'näkkileip', 'leip', 'ruisleip', 'paahtoleip', 'sämpyl', 'knäkki',
    'korppu', 'säilyke', 'papu', 'kikherne', 'linssi', 'hillo', 'hunaja', 'maapähkinävoi',
    'kaakaojauhe', 'kvinoa', 'siemen', 'manteli', 'rusina', 'taateli', 'kookos',
    'korppujauho', 'leseet', 'pellava', 'chia',
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
