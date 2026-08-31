import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { AppMark } from '../components/AppMark'
import { Field, Button } from '../components/ui'
import {
  checkInvite, clearInviteFromUrl, inviteTokenFromUrl, redeemInvite,
} from '../lib/invites'

// Kirjautuminen, ja kutsulinkillä myös tunnuksen luonti.
//
// Vapaata rekisteröitymisnappia ei ole: tunnuksen voi luoda vain kutsulinkillä,
// joka kantaa mukanaan myönnetyt työkalut. Se on koko idea — itsepalveluna
// luotu tili olisi oletusten varassa ja kenen tahansa tehtävissä, kun taas
// kutsuttu tili on jonkun tietoisesti päästämä ja oikeudet on päätetty jo
// ennen ensimmäistä kirjautumista.
//
// Salasanan pituutta ei tarkisteta kirjautumisessa: kuuden merkin minimi on
// luontisääntö, ja sen vartija on GoTrue.
export function LoginView() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Kutsutila. `token` säilyy vaikka osoite siivotaan, jotta lunastus toimii
  // eikä käytetty linkki jää historiaan.
  const [token, setToken] = useState<string | null>(null)
  const [inviteLabel, setInviteLabel] = useState('')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [checkingInvite, setCheckingInvite] = useState(false)

  useEffect(() => {
    const t = inviteTokenFromUrl()
    if (!t) return
    setCheckingInvite(true)
    clearInviteFromUrl()
    checkInvite(t)
      .then((r) => {
        if (r.valid) {
          setToken(t)
          setInviteLabel(r.label ?? '')
        } else {
          setInviteError(r.reason ?? 'Kutsulinkki ei kelpaa')
        }
      })
      .catch(() => setInviteError('Kutsun tarkistus ei onnistunut'))
      .finally(() => setCheckingInvite(false))
  }, [])

  const handleSubmit = async () => {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed || !password) return
    setLoading(true)
    setError(null)

    // Kutsutilassa luodaan tunnus ensin ja kirjaudutaan heti perään samoilla
    // tiedoilla, jotta kutsuttu ei joudu kirjoittamaan niitä kahdesti.
    if (token) {
      try {
        await redeemInvite({ token, email: trimmed, password, name })
      } catch (e) {
        setLoading(false)
        setError(e instanceof Error ? e.message : 'Tunnuksen luonti ei onnistunut')
        return
      }
    }

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
          {checkingInvite
            ? 'Tarkistetaan kutsua…'
            : token
              ? inviteLabel
                ? `Tervetuloa, ${inviteLabel}. Luo tunnus alle.`
                : 'Sinut on kutsuttu. Luo tunnus alle.'
              : 'Kirjaudu sisään synkronoidaksesi tiedot.'}
        </p>
      </div>

      {/* ── Glass card ─────────────────────────────────────────────────── */}
      <div className="card-enter w-full max-w-[320px] rounded-glass border border-white/[0.14] bg-[rgba(9,11,20,0.50)] p-6 [backdrop-filter:blur(26px)_saturate(180%)] [-webkit-backdrop-filter:blur(26px)_saturate(180%)] shadow-[0_28px_70px_-24px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.16)]" style={{ animationDelay: '60ms' }}>
        <div className="flex flex-col gap-1">
          {token && (
            <Field
              label="Nimi"
              type="text"
              placeholder="Etunimi"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="given-name"
            />
          )}
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
            label={token ? 'Salasana (väh. 6 merkkiä)' : 'Salasana'}
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            autoComplete={token ? 'new-password' : 'current-password'}
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
              ? token ? 'Luodaan tunnusta…' : 'Kirjaudutaan…'
              : token ? 'Luo tunnus' : 'Kirjaudu sisään'}
          </Button>
        </div>
      </div>

      {/* ── Invite problem ─────────────────────────────────────────────── */}
      {inviteError && (
        <p className="view-enter m-0 max-w-[320px] text-center text-[12px] text-fg-faint">
          {inviteError}. Kirjaudu sisään tai pyydä uusi kutsulinkki.
        </p>
      )}

      {/* ── Error message ──────────────────────────────────────────────── */}
      {error && (
        <p className="view-enter m-0 max-w-[320px] text-center text-[12px] text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
