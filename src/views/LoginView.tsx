import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { MimirMark } from '../components/MimirMark'
import { Field, Button } from '../components/ui'

export function LoginView() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed || password.length < 6) return
    setLoading(true)
    setError(null)
    const err = mode === 'signin' ? await signIn(trimmed, password) : await signUp(trimmed, password)
    setLoading(false)
    if (err) setError(err)
    // On success AuthContext updates user → App shows the main UI
  }

  const isDisabled = loading || !email.trim() || password.length < 6

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 py-8">

      {/* ── Logo / heading ─────────────────────────────────────────────── */}
      <div className="mb-2 text-center">
        <div className="mb-3.5 flex justify-center">
          <MimirMark size={64} />
        </div>
        <h1 className="font-display m-0 mb-1 text-[22px] font-bold uppercase tracking-[0.18em] text-text">
          Mimir
        </h1>
        <p className="m-0 text-[13px] leading-relaxed text-white/[0.38]">
          {mode === 'signin' ? 'Kirjaudu sisään synkronoidaksesi tiedot.' : 'Luo tili synkronoidaksesi tiedot.'}
        </p>
      </div>

      {/* ── Glass card ─────────────────────────────────────────────────── */}
      <div className="w-full max-w-[320px] rounded-glass border border-white/[0.14] bg-white/[0.06] p-6 [backdrop-filter:blur(26px)_saturate(180%)] [-webkit-backdrop-filter:blur(26px)_saturate(180%)] shadow-[0_28px_70px_-24px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.16)]">
        <div className="flex flex-col gap-0">
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
            label="Salasana (väh. 6 merkkiä)"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />
        </div>

        <div className="mt-2 flex flex-col gap-2">
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={isDisabled}
            className="w-full py-[15px] text-[15px]"
          >
            {loading
              ? mode === 'signin' ? 'Kirjaudutaan…' : 'Luodaan tiliä…'
              : mode === 'signin' ? 'Kirjaudu sisään' : 'Luo tili'}
          </Button>

          <button
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin')
              setError(null)
            }}
            className="cursor-pointer bg-transparent border-none py-2 text-[12px] text-white/40"
          >
            {mode === 'signin' ? 'Ei tiliä? Luo tili' : 'Onko jo tili? Kirjaudu sisään'}
          </button>
        </div>
      </div>

      {/* ── Error message ──────────────────────────────────────────────── */}
      {error && (
        <p className="m-0 max-w-[320px] text-center text-[12px] text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
