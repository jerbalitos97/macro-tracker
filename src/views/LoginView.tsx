import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { AppMark } from '../components/AppMark'
import { Field, Button } from '../components/ui'

// Vain kirjautuminen. Rekisteröitymistila poistettiin kun tilit siirtyivät
// adminin luotaviksi — itsepalveluna luotu tili saisi vain oletustyökalut,
// mutta jokainen appiin kirjautuva on joku jonka admin tuntee, joten nappi
// oli tässä vaiheessa pelkkä hyökkäyspinta. Salasanan pituutta ei tarkisteta
// tässä: kuuden merkin minimi on rekisteröitymissääntö, ja sen vartija on
// GoTrue — kirjautumisessa väärä salasana kaatuu joka tapauksessa palvelimeen.
export function LoginView() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed || !password) return
    setLoading(true)
    setError(null)
    const err = await signIn(trimmed, password)
    setLoading(false)
    if (err) setError(err)
    // On success AuthContext updates user → App shows the main UI
  }

  const isDisabled = loading || !email.trim() || !password

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 py-8">

      {/* ── Logo / heading ─────────────────────────────────────────────── */}
      <div className="card-enter mb-2 text-center">
        <div className="mb-3.5 flex justify-center">
          <AppMark size={64} />
        </div>
        <h1 className="font-display m-0 mb-1 text-[22px] font-bold uppercase tracking-[0.18em] text-text">
          Friday
        </h1>
        <p className="m-0 text-[13px] leading-relaxed text-fg-faint">
          Kirjaudu sisään synkronoidaksesi tiedot.
        </p>
      </div>

      {/* ── Glass card ─────────────────────────────────────────────────── */}
      <div className="card-enter w-full max-w-[320px] rounded-glass border border-white/[0.14] bg-[rgba(9,11,20,0.50)] p-6 [backdrop-filter:blur(26px)_saturate(180%)] [-webkit-backdrop-filter:blur(26px)_saturate(180%)] shadow-[0_28px_70px_-24px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.16)]" style={{ animationDelay: '60ms' }}>
        <div className="flex flex-col gap-1">
          <Field
            label="Sähköpostiosoite"
            type="email"
            placeholder="nimi@esimerkki.fi"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            autoComplete="email"
            inputMode="email"
          />
          <Field
            label="Salasana"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            autoComplete="current-password"
          />
        </div>

        <div className="mt-2 flex flex-col gap-2">
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={isDisabled}
            className="w-full py-[15px] text-[15px]"
          >
            {loading ? 'Kirjaudutaan…' : 'Kirjaudu sisään'}
          </Button>
        </div>
      </div>

      {/* ── Error message ──────────────────────────────────────────────── */}
      {error && (
        <p className="view-enter m-0 max-w-[320px] text-center text-[12px] text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
