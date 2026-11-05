import { useCallback, useEffect, useRef, useState } from 'react'
import { Fingerprint, LockKeyhole } from 'lucide-react'
import { AppMark } from './AppMark'
import { Button, Sheet } from './ui'
import {
  RELOCK_AFTER_MS, MAX_FAILURES, biometricAvailable, enrollBiometric, getLock, isValidPin,
  setPin, unlockBiometric, unlockPin, type LockConfig,
} from '../lib/appLock'

// Sovelluslukon näkymät. Logiikka ja rajaukset: lib/appLock.ts.

/** Lukittu kun sovellus käynnistyy, ja uudelleen kun se on ollut taustalla
 *  yli RELOCK_AFTER_MS. Ilman käyttäjää tai asetettua lukkoa ei koskaan. */
export function useAppLock(userId: string | undefined) {
  // Lukitus lasketaan renderöinnissä eikä efektissä: käyttäjä tulee sisään
  // samassa renderöinnissä kuin päänäkymä, ja efektin jälkeen asetettu lukko
  // näyttäisi sovelluksen sisällön yhden ruudun ajan ennen lukkonäyttöä.
  const [unlockedFor, setUnlockedFor] = useState<string | null>(null)
  const config = userId ? getLock(userId) : null
  const locked = !!config && unlockedFor !== userId
  const hiddenAt = useRef<number | null>(null)

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now()
        return
      }
      const away = hiddenAt.current ? Date.now() - hiddenAt.current : 0
      hiddenAt.current = null
      if (away > RELOCK_AFTER_MS) setUnlockedFor(null)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const unlock = useCallback(() => setUnlockedFor(userId ?? null), [userId])

  // Juuri asetettu lukko ei lukitse heti: käyttäjä on jo sisällä.
  return { locked, config, unlock, refresh: unlock }
}

// ── Lukkonäyttö ───────────────────────────────────────────────

export function LockScreen({
  config, onUnlocked, onLockedOut,
}: { config: LockConfig; onUnlocked: () => void; onLockedOut: () => void }) {
  const [pin, setPinValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [failures, setFailures] = useState(config.failures)

  const tryBiometric = async () => {
    setError(null)
    if (await unlockBiometric(config)) onUnlocked()
    else if (!config.pin) setError('Tunnistus ei onnistunut. Yritä uudelleen.')
  }

  const submitPin = async (value: string) => {
    if (!isValidPin(value) || busy) return
    setBusy(true)
    const r = await unlockPin({ ...config, failures }, value)
    setBusy(false)
    if (r === 'ok') return onUnlocked()
    if (r === 'locked-out') return onLockedOut()
    const next = failures + 1
    setFailures(next)
    setPinValue('')
    setError(`Väärä PIN — ${MAX_FAILURES - next} yritystä jäljellä ennen uloskirjausta`)
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 py-8">
      <div className="text-center">
        <div className="mb-3.5 flex justify-center">
          <AppMark size={56} />
        </div>
        <h1 className="font-display m-0 text-[20px] font-bold uppercase tracking-[0.18em] text-text">Friday</h1>
        <p className="mt-1 text-[13px] text-fg-faint">Sovellus on lukittu</p>
      </div>

      <div className="flex w-full max-w-[280px] flex-col gap-3">
        {config.credentialId && (
          <Button onClick={() => void tryBiometric()}>
            <Fingerprint size={16} className="mr-2" />
            Avaa tunnistuksella
          </Button>
        )}
        {config.pin && (
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            maxLength={4}
            autoFocus={!config.credentialId}
            value={pin}
            aria-label="PIN-koodi"
            placeholder="PIN"
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 4)
              setPinValue(v)
              if (v.length === 4) void submitPin(v)
            }}
            className="w-full rounded-input border border-white/10 bg-black/[0.45] px-4 py-3 text-center font-mono text-[24px] tracking-[0.6em] text-text [color-scheme:dark]"
          />
        )}
        {error && <p role="alert" className="text-center text-[12px] text-danger">{error}</p>}
      </div>
    </div>
  )
}

// ── Käyttöönotto ──────────────────────────────────────────────

/** Asettaa biometrian ja/tai PIN:n. Käytetään kirjautumisen jälkeisessä
 *  tarjouksessa ja asetuksissa. */
export function LockSetup({ userId, label, onDone }: { userId: string; label: string; onDone: () => void }) {
  const [bioOk, setBioOk] = useState<boolean | null>(null)
  const [bioDone, setBioDone] = useState(() => !!getLock(userId)?.credentialId)
  const [pin, setPinValue] = useState('')
  const [pin2, setPin2] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void biometricAvailable().then(setBioOk)
  }, [])

  const enroll = async () => {
    setError(null)
    try {
      await enrollBiometric(userId, label)
      setBioDone(true)
    } catch {
      setError('Tunnistuksen käyttöönotto ei onnistunut')
    }
  }

  const savePin = async () => {
    setError(null)
    if (!isValidPin(pin)) return setError('PIN on neljä numeroa')
    if (pin !== pin2) return setError('PIN-koodit eivät täsmää')
    await setPin(userId, pin)
    onDone()
  }

  const pinInput = (value: string, set: (v: string) => void, label: string) => (
    <input
      type="password"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      maxLength={4}
      value={value}
      aria-label={label}
      placeholder={label}
      onChange={(e) => set(e.target.value.replace(/\D/g, '').slice(0, 4))}
      className="w-full rounded-input border border-white/10 bg-black/[0.45] px-4 py-3 text-center font-mono text-[18px] tracking-[0.4em] text-text placeholder:tracking-normal placeholder:text-[13px] placeholder:text-fg-ghost [color-scheme:dark]"
    />
  )

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] leading-relaxed text-fg-muted">
        Lukko kysytään aina kun avaat sovelluksen, ja kun se on ollut taustalla yli viisi minuuttia.
        Se koskee vain tätä laitetta. Varalla on PIN-koodi; viiden väärän jälkeen kirjaudut ulos.
      </p>

      {bioOk && (
        <Button variant={bioDone ? 'secondary' : 'primary'} disabled={bioDone} onClick={() => void enroll()}>
          <Fingerprint size={16} className="mr-2" />
          {bioDone ? 'Tunnistus käytössä' : 'Ota Face ID / sormenjälki käyttöön'}
        </Button>
      )}
      {bioOk === false && (
        <p className="text-[12px] text-fg-ghost">Tämä laite tai selain ei tarjoa biometristä tunnistusta. PIN toimii silti.</p>
      )}

      <div className="flex flex-col gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-dim">PIN-koodi (4 numeroa)</span>
        {pinInput(pin, setPinValue, 'PIN')}
        {pinInput(pin2, setPin2, 'PIN uudelleen')}
      </div>

      {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}

      <div className="flex gap-2">
        <Button variant="ghost" onClick={onDone}>{bioDone ? 'Valmis ilman PIN:iä' : 'Ei nyt'}</Button>
        <Button disabled={pin.length !== 4 || pin2.length !== 4} onClick={() => void savePin()}>
          <LockKeyhole size={15} className="mr-2" />
          Tallenna
        </Button>
      </div>
    </div>
  )
}

export function LockOfferSheet({
  open, userId, label, onClose,
}: { open: boolean; userId: string; label: string; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Lukitse sovellus">
      <LockSetup userId={userId} label={label} onDone={onClose} />
    </Sheet>
  )
}
