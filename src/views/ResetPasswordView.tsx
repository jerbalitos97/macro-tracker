import { useEffect, useRef, useState } from 'react'
import { AppMark } from '../components/AppMark'
import { Field, Button } from '../components/ui'
import { clearRecoveryFromUrl, redeemRecovery, setNewPassword } from '../lib/passwordReset'

// Uuden salasanan asetus adminin lähettämällä linkillä (`/?palauta=…`).
//
// Tunnus kulutetaan vasta tässä, ei linkin avauksessa — ks. api/salasana.ts.
// Onnistunut tarkistus kirjaa käyttäjän sisään, joten salasanan vaihdon jälkeen
// hän on suoraan sovelluksessa eikä joudu kirjautumaan erikseen.

const MIN_PASSWORD = 6

export function ResetPasswordView({ token, onDone }: { token: string; onDone: () => void }) {
  const [phase, setPhase] = useState<'checking' | 'ready' | 'invalid'>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Kertakäyttöinen tunnus: StrictModen tuplamount kuluttaisi sen kahdesti ja
  // jälkimmäinen näyttäisi "linkki on jo käytetty".
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    redeemRecovery(token).then((err) => {
      if (err) {
        setError(err)
        setPhase('invalid')
      } else {
        setPhase('ready')
      }
    })
  }, [token])

  const submit = async () => {
    if (password.length < MIN_PASSWORD) {
      setError(`Salasanassa on oltava vähintään ${MIN_PASSWORD} merkkiä`)
      return
    }
    if (password !== confirm) {
      setError('Salasanat eivät täsmää')
      return
    }
    setSaving(true)
    setError(null)
    const err = await setNewPassword(password)
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    clearRecoveryFromUrl()
    onDone()
  }

  const leave = () => {
    clearRecoveryFromUrl()
    onDone()
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 py-8">
      <div className="card-enter mb-2 text-center">
        <div className="mb-3.5 flex justify-center">
          <AppMark size={64} />
        </div>
        <h1 className="font-display m-0 mb-1 text-[22px] font-bold uppercase tracking-[0.18em] text-text">
          Uusi salasana
        </h1>
        <p className="m-0 text-[13px] leading-relaxed text-fg-faint">
          {phase === 'checking'
            ? 'Tarkistetaan linkkiä…'
            : phase === 'ready'
              ? 'Valitse uusi salasana. Kukaan muu ei näe sitä.'
              : 'Linkki ei kelpaa.'}
        </p>
      </div>

      <div className="card-enter w-full max-w-[320px] rounded-glass border border-white/[0.14] bg-[rgba(9,11,20,0.50)] p-6 [backdrop-filter:blur(26px)_saturate(180%)] [-webkit-backdrop-filter:blur(26px)_saturate(180%)]">
        {phase === 'ready' && (
          <div className="flex flex-col gap-1">
            <Field
              label="Uusi salasana"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <Field
              label="Salasana uudelleen"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void submit()}
              autoComplete="new-password"
            />
            {error && <p role="alert" className="mb-2 text-[12px] text-danger">{error}</p>}
            <Button onClick={() => void submit()} disabled={saving || !password || !confirm}>
              {saving ? 'Tallennetaan…' : 'Tallenna ja jatka'}
            </Button>
          </div>
        )}
        {phase === 'invalid' && (
          <div className="flex flex-col gap-3">
            <p role="alert" className="text-[13px] text-danger">{error}</p>
            <Button variant="secondary" onClick={leave}>Kirjautumiseen</Button>
          </div>
        )}
      </div>
    </div>
  )
}
