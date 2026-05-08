import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export function LoginView() {
  const { sendOtp, verifyOtp } = useAuth()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSend = async () => {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    const err = await sendOtp(trimmed)
    setLoading(false)
    if (err) {
      setError(err)
    } else {
      setStep('code')
    }
  }

  const handleVerify = async () => {
    if (code.length < 6) return
    setLoading(true)
    setError(null)
    const err = await verifyOtp(email.trim().toLowerCase(), code.trim())
    setLoading(false)
    if (err) setError(err)
    // On success AuthContext updates user → App shows the main UI
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100dvh',
        padding: '32px 24px',
        gap: 20,
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 36, lineHeight: 1, marginBottom: 12 }}>🔥</div>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: '#fff',
            margin: '0 0 6px',
            letterSpacing: '-0.01em',
          }}
        >
          Makrot
        </h1>
        <p
          style={{
            fontSize: 13,
            color: 'rgba(255,255,255,0.38)',
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          {step === 'email' ? 'Kirjaudu sisään synkronoidaksesi tiedot pilvipalveluun.' : 'Tarkista sähköpostisi ja syötä koodi.'}
        </p>
      </div>

      {step === 'email' ? (
        <>
          <input
            type="email"
            placeholder="Sähköpostiosoite"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            autoComplete="email"
            inputMode="email"
            style={inputCss}
          />
          <button
            onClick={handleSend}
            disabled={loading || !email.trim()}
            style={btnCss(loading || !email.trim())}
          >
            {loading ? 'Lähetetään…' : 'Lähetä koodi'}
          </button>
        </>
      ) : (
        <>
          <p
            style={{
              fontSize: 13,
              color: 'rgba(255,255,255,0.45)',
              textAlign: 'center',
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            Koodi lähetetty osoitteeseen{' '}
            <span style={{ color: '#d4b85a', fontWeight: 600 }}>{email}</span>
          </p>
          <input
            type="text"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            style={{
              ...inputCss,
              textAlign: 'center',
              letterSpacing: '0.35em',
              fontSize: 26,
              fontWeight: 700,
              fontFamily: "ui-monospace, 'SF Mono', monospace",
            }}
          />
          <button
            onClick={handleVerify}
            disabled={loading || code.length < 6}
            style={btnCss(loading || code.length < 6)}
          >
            {loading ? 'Tarkistetaan…' : 'Kirjaudu sisään'}
          </button>
          <button
            onClick={() => {
              setStep('email')
              setCode('')
              setError(null)
            }}
            style={{
              fontSize: 12,
              color: 'rgba(255,255,255,0.28)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '8px 0',
              marginTop: -8,
            }}
          >
            ← Vaihda sähköpostiosoite
          </button>
        </>
      )}

      {error && (
        <p
          style={{
            fontSize: 12,
            color: '#e87a6a',
            textAlign: 'center',
            margin: 0,
            maxWidth: 320,
          }}
        >
          {error}
        </p>
      )}
    </div>
  )
}

const inputCss: React.CSSProperties = {
  width: '100%',
  maxWidth: 320,
  padding: '14px 16px',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.1)',
  backgroundColor: 'rgba(255,255,255,0.05)',
  color: '#fff',
  fontSize: 16,
  outline: 'none',
  boxSizing: 'border-box',
  WebkitAppearance: 'none',
}

const btnCss = (disabled: boolean): React.CSSProperties => ({
  width: '100%',
  maxWidth: 320,
  padding: '15px 16px',
  borderRadius: 12,
  border: 'none',
  backgroundColor: disabled ? 'rgba(255,255,255,0.06)' : '#d4b85a',
  color: disabled ? 'rgba(255,255,255,0.2)' : '#000',
  fontSize: 15,
  fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer',
  transition: 'background 0.18s',
  letterSpacing: '0.01em',
})
