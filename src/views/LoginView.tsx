import { useEffect, useId, useState, type ReactNode } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { greeting } from './HomeView'
import { AlertCircle, Eye, EyeOff } from 'lucide-react'
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
  const [showPassword, setShowPassword] = useState(false)

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

  const eyebrow = token ? 'Kutsu Fridayhin' : greeting(new Date())
  const headline = token ? 'Luo tunnuksesi' : 'Tervetuloa takaisin'
  const lead = checkingInvite
    ? 'Tarkistetaan kutsua…'
    : token
      ? inviteLabel
        ? `Hei ${inviteLabel}! Valitse salasana, niin pääset alkuun.`
        : 'Sinut on kutsuttu. Valitse salasana, niin pääset alkuun.'
      : 'Ateriat, treenit ja tavat kulkevat mukanasi laitteelta toiselle.'
  const message = error ?? (inviteError ? `${inviteError}. Kirjaudu sisään tai pyydä uusi kutsulinkki.` : null)

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-[480px] flex-col overflow-hidden px-6 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+72px)] text-text">

      {/* ── M3 Expressive -muodot ──────────────────────────────────────
          Logon tilalla pelkkä muotokieli: ympyrä, pilleri ja pehmeä neliö
          sävytettyinä Kodin syaaniin ja violettiin. Koriste, ei sisältöä. */}
      <div aria-hidden className="pointer-events-none absolute right-[-48px] top-[calc(env(safe-area-inset-top)-24px)] h-[240px] w-[240px]">
        <div className="view-enter absolute right-[72px] top-[36px] h-[120px] w-[120px] rounded-full bg-cyan/[0.22]" />
        <div className="view-enter absolute right-[8px] top-[96px] h-[64px] w-[150px] rotate-[-28deg] rounded-full bg-violet/[0.26]" style={{ animationDelay: '40ms' }} />
        <div className="view-enter absolute right-[124px] top-[148px] h-[52px] w-[52px] rotate-[18deg] rounded-[18px] bg-blue/[0.30]" style={{ animationDelay: '80ms' }} />
      </div>

      {/* ── Otsikko ───────────────────────────────────────────────────── */}
      <header className="view-enter relative mt-[120px] flex flex-col gap-3">
        <p className="text-[14px] font-medium leading-5 tracking-[0.01em] text-cyan">{eyebrow}</p>
        <h1 className="text-[45px] font-normal leading-[52px] tracking-[-0.01em]">{headline}</h1>
        <p className="max-w-[32ch] text-[16px] leading-6 text-fg-muted">{lead}</p>
      </header>

      {/* ── Lomake ────────────────────────────────────────────────────── */}
      <form
        className="view-enter relative mt-10 flex flex-col gap-4"
        style={{ animationDelay: '60ms' }}
        onSubmit={(e) => { e.preventDefault(); if (!isDisabled) void handleSubmit() }}
        noValidate
      >
        {token && (
          <M3Field
            label="Etunimi"
            type="text"
            value={name}
            onChange={setName}
            autoComplete="given-name"
          />
        )}
        <M3Field
          label="Sähköposti"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete={token ? 'email' : 'username'}
          inputMode="email"
        />
        <M3Field
          label="Salasana"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={setPassword}
          autoComplete={token ? 'new-password' : 'current-password'}
          supporting={token ? 'Vähintään 6 merkkiä' : undefined}
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Piilota salasana' : 'Näytä salasana'}
              className="flex h-12 w-12 min-h-0 min-w-0 items-center justify-center rounded-full text-fg-muted"
            >
              {showPassword ? <EyeOff size={22} /> : <Eye size={22} />}
            </button>
          }
        />

        {message && (
          <p role="alert" className="view-enter flex items-start gap-2 px-4 text-[14px] leading-5 text-danger">
            <AlertCircle size={18} className="mt-px shrink-0" />
            <span>{message}</span>
          </p>
        )}

        <button
          type="submit"
          disabled={isDisabled}
          className="mt-4 flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-cyan text-[16px] font-medium text-bg shadow-[0_12px_32px_-12px_rgba(34,211,238,0.7)] transition-[background-color,color,box-shadow] duration-200 disabled:cursor-not-allowed disabled:bg-white/[0.12] disabled:text-white/[0.38] disabled:shadow-none"
        >
          {loading
            ? token ? 'Luodaan tunnusta…' : 'Kirjaudutaan…'
            : token ? 'Luo tunnus' : 'Kirjaudu sisään'}
        </button>
      </form>

      {/* ── Alatunniste ───────────────────────────────────────────────── */}
      <p className="relative mt-auto pt-12 text-center text-[12px] leading-4 text-fg-muted">
        {token ? 'Tunnus sidotaan tähän kutsuun.' : 'Uuden tunnuksen saa vain kutsulinkillä.'}
      </p>
    </div>
  )
}

// M3 filled text field: sävytetty pinta, yläkulmat pyöristetty, aktiivisuusviiva
// alareunassa ja kelluva otsikko. Otsikko nousee kun kenttä on fokuksessa tai
// siinä on arvo — `placeholder=" "` + :placeholder-shown hoitaa myös iOS:n
// automaattitäytön, joka asettaa arvon ilman input-tapahtumaa.
function M3Field({
  label, value, onChange, type, autoComplete, inputMode, supporting, trailing,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type: string
  autoComplete?: string
  inputMode?: 'email' | 'text'
  supporting?: string
  trailing?: ReactNode
}) {
  const id = useId()
  return (
    <div>
      <div className="group relative rounded-t-[16px] bg-[var(--surface-3)] transition-colors focus-within:bg-[#272b42]">
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder=" "
          autoComplete={autoComplete}
          inputMode={inputMode}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={`peer block h-14 w-full rounded-t-[16px] bg-transparent pb-2 pl-4 pt-6 text-[16px] text-text outline-none [color-scheme:dark] focus-visible:outline-none ${trailing ? 'pr-14' : 'pr-4'}`}
        />
        <label
          htmlFor={id}
          className="pointer-events-none absolute left-4 top-2 origin-left text-[12px] leading-4 text-fg-muted transition-all duration-150 peer-placeholder-shown:top-4 peer-placeholder-shown:text-[16px] peer-placeholder-shown:leading-6 peer-focus:top-2 peer-focus:text-[12px] peer-focus:leading-4 peer-focus:text-cyan"
        >
          {label}
        </label>
        {trailing && <div className="absolute right-1 top-1">{trailing}</div>}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-fg-muted/60 transition-all peer-focus:h-[2px] peer-focus:bg-cyan" />
      </div>
      {supporting && <p className="px-4 pt-1 text-[12px] leading-4 text-fg-muted">{supporting}</p>}
    </div>
  )
}
