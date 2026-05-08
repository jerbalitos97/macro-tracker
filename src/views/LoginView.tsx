import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

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
          {mode === 'signin' ? 'Kirjaudu sisään synkronoidaksesi tiedot.' : 'Luo tili synkronoidaksesi tiedot.'}
        </p>
      </div>

      <input
        type="email"
        placeholder="Sähköpostiosoite"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        autoComplete="email"
        inputMode="email"
        style={inputCss}
      />
      <input
        type="password"
        placeholder="Salasana (väh. 6 merkkiä)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
        style={inputCss}
      />
      <button
        onClick={handleSubmit}
        disabled={loading || !email.trim() || password.length < 6}
        style={btnCss(loading || !email.trim() || password.length < 6)}
      >
        {loading
          ? mode === 'signin' ? 'Kirjaudutaan…' : 'Luodaan tiliä…'
          : mode === 'signin' ? 'Kirjaudu sisään' : 'Luo tili'}
      </button>

      <button
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin')
          setError(null)
        }}
        style={{
          fontSize: 12,
          color: 'rgba(255,255,255,0.4)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '8px 0',
          marginTop: -8,
        }}
      >
        {mode === 'signin' ? 'Ei tiliä? Luo tili' : 'Onko jo tili? Kirjaudu sisään'}
      </button>

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
