// Sovelluslukko: Face ID / sormenjälki / 4-numeroinen PIN.
//
// MITÄ TÄMÄ ON JA MITÄ EI. Laitteen oma lukko, joka estää sovelluksen
// avaamisen ilman omistajaa — lainattu tai lukitsematon puhelin. Kirjautumis-
// istunto on yhä puhelimen muistissa, joten tämä ei suojaa ketään vastaan, joka
// pääsee käsiksi selaimen tallennustilaan. Palvelin ei tiedä lukosta mitään.
//
// Biometria kulkee WebAuthnin kautta: laite luo alustatunnisteen (Face ID,
// Touch ID, Androidin sormenjälki — laite valitsee itse) ja avaus pyytää sitä
// `userVerification: 'required'` -vaatimuksella. Allekirjoitusta ei tarkisteta
// palvelimella, koska tämä on paikallinen portti; tarkistus on se, että käyttöjär-
// jestelmä vahvisti käyttäjän ennen kuin palautti tunnisteen.
//
// PIN tallennetaan suolattuna PBKDF2-tiivisteenä, ei koskaan sellaisenaan.
// Neljä numeroa on heikko, joten MAX_FAILURES väärän jälkeen kirjaudutaan ulos
// ja lukko nollataan — sen jälkeen pääsee vain salasanalla.
//
// Asetus on laitekohtainen eikä synkronoidu: biometrinen tunniste on sidottu
// tähän laitteeseen, eikä PIN-tiivistettä haluta pilveen.
// Avain on exportData.ts:n SENSITIVE_KEYS-listalla.

export const LOCK_KEY = 'friday.lock:v1'
/** Kirjautumisen jälkeen näytettävä tarjous — sessionStorage, ei pysyvä. */
const OFFER_KEY = 'friday.lock.offer'

export const MAX_FAILURES = 5
/** Taustalla tätä kauemmin olleen sovelluksen pitää avata lukko uudelleen. */
export const RELOCK_AFTER_MS = 5 * 60 * 1000
const PBKDF2_ITERATIONS = 150_000

export interface LockConfig {
  userId: string
  /** WebAuthn-tunnisteen rawId base64url-muodossa. */
  credentialId?: string
  pin?: { salt: string; hash: string }
  failures: number
}

const b64u = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromB64u = (s: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
const random = (n: number): Uint8Array<ArrayBuffer> => crypto.getRandomValues(new Uint8Array(new ArrayBuffer(n)))

export function getLock(userId: string): LockConfig | null {
  try {
    const raw = localStorage.getItem(LOCK_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as LockConfig
    // Toisen käyttäjän lukko samalla laitteella ei koske tätä istuntoa.
    if (c.userId !== userId || (!c.credentialId && !c.pin)) return null
    return c
  } catch {
    return null
  }
}

function saveLock(c: LockConfig): void {
  try {
    localStorage.setItem(LOCK_KEY, JSON.stringify(c))
  } catch {
    /* täysi tai estetty tallennustila: lukko jää pois päältä */
  }
}

export function clearLock(): void {
  try {
    localStorage.removeItem(LOCK_KEY)
  } catch {
    /* ei mitään poistettavaa */
  }
}

// ── Tarjous kirjautumisen jälkeen ─────────────────────────────

export function markLockOffer(): void {
  try {
    sessionStorage.setItem(OFFER_KEY, '1')
  } catch {
    /* tarjous on mukavuus, ei pakko */
  }
}
export function takeLockOffer(): boolean {
  try {
    const v = sessionStorage.getItem(OFFER_KEY) === '1'
    sessionStorage.removeItem(OFFER_KEY)
    return v
  } catch {
    return false
  }
}

// ── Biometria ─────────────────────────────────────────────────

export async function biometricAvailable(): Promise<boolean> {
  try {
    return (
      typeof window.PublicKeyCredential !== 'undefined' &&
      (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    )
  } catch {
    return false
  }
}

/** Luo laitteen tunnisteen. Kutsuttava napin painalluksesta (Safari vaatii). */
export async function enrollBiometric(userId: string, label: string): Promise<void> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: random(32),
      rp: { name: 'Friday', id: window.location.hostname },
      user: { id: new TextEncoder().encode(userId), name: label, displayName: label },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'discouraged',
      },
      timeout: 60_000,
      attestation: 'none',
    },
  })) as PublicKeyCredential | null
  if (!cred) throw new Error('Tunnistusta ei otettu käyttöön')
  const prev = getLock(userId)
  saveLock({ userId, pin: prev?.pin, credentialId: b64u(cred.rawId), failures: 0 })
}

export async function unlockBiometric(c: LockConfig): Promise<boolean> {
  if (!c.credentialId) return false
  try {
    const res = await navigator.credentials.get({
      publicKey: {
        challenge: random(32),
        allowCredentials: [{ type: 'public-key', id: fromB64u(c.credentialId) }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })
    if (!res) return false
    saveLock({ ...c, failures: 0 })
    return true
  } catch {
    // Peruttu tai epäonnistunut tunnistus ei kasvata laskuria: käyttöjärjestelmä
    // rajoittaa biometrian yritykset itse, ja PIN on aina varalla.
    return false
  }
}

// ── PIN ───────────────────────────────────────────────────────

async function hashPin(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  )
  return b64u(bits)
}

export const isValidPin = (pin: string) => /^\d{4}$/.test(pin)

export async function setPin(userId: string, pin: string): Promise<void> {
  if (!isValidPin(pin)) throw new Error('PIN on neljä numeroa')
  const salt = random(16)
  const prev = getLock(userId)
  saveLock({
    userId,
    credentialId: prev?.credentialId,
    pin: { salt: b64u(salt), hash: await hashPin(pin, salt) },
    failures: 0,
  })
}

/** 'ok' | 'wrong' | 'locked-out' — viimeisin tarkoittaa: kirjaa ulos. */
export async function unlockPin(c: LockConfig, pin: string): Promise<'ok' | 'wrong' | 'locked-out'> {
  if (!c.pin) return 'wrong'
  const hash = await hashPin(pin, fromB64u(c.pin.salt))
  if (hash === c.pin.hash) {
    saveLock({ ...c, failures: 0 })
    return 'ok'
  }
  const failures = c.failures + 1
  if (failures >= MAX_FAILURES) {
    clearLock()
    return 'locked-out'
  }
  saveLock({ ...c, failures })
  return 'wrong'
}
