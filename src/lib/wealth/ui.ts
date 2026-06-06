// Shared inline-style tokens for the Wealth feature so its components don't
// need Tailwind. Values mirror the host Mimir theme:
//   bg-bg            → #0a0a0a   (page bg)
//   bg-surface       → #131313   (card)
//   bg-surface-2     → rgba(0,0,0,0.45)  (inset input bg)
//   border-border    → rgba(255,255,255,0.07)
//   text-text        → #ebebeb
//   text-muted       → rgba(255,255,255,0.4)
//   bg-accent        → #d4b85a   (Mimir gold)
//   text-goal        → #f59e0b   (amber, goal threshold)
//   text-danger      → #e87a6a
//
// Chart series colors (recharts hardcoded values) live in PortfolioChart —
// they're functional data colors, not theme.

import type { CSSProperties } from 'react'

export const C = {
  bg: '#0a0a0a',
  surface: '#131313',
  surface2: 'rgba(0,0,0,0.45)',
  border: 'rgba(255,255,255,0.07)',
  borderHi: 'rgba(212,184,90,0.35)',
  text: '#ebebeb',
  muted: 'rgba(255,255,255,0.4)',
  accent: '#d4b85a',
  goal: '#f59e0b',
  danger: '#e87a6a',
}

export const card: CSSProperties = {
  borderRadius: 12,
  border: `1px solid ${C.border}`,
  backgroundColor: C.surface,
  padding: 16,
}

export const input: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: `1px solid ${C.border}`,
  backgroundColor: C.surface2,
  color: C.text,
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
}

export const labelText: CSSProperties = { fontSize: 11, color: C.muted }

export const primaryBtn: CSSProperties = {
  padding: '10px 16px',
  borderRadius: 8,
  border: 'none',
  backgroundColor: C.accent,
  color: C.bg,
  fontSize: 13,
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

export const secondaryBtn: CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: `1px solid ${C.border}`,
  backgroundColor: C.surface2,
  color: C.text,
  fontSize: 12,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

export const ghostBtn: CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: `1px solid ${C.border}`,
  backgroundColor: 'transparent',
  color: C.muted,
  fontSize: 12,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

export const chip = (active: boolean): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  borderRadius: 999,
  padding: '6px 12px',
  fontSize: 11,
  fontFamily: 'inherit',
  cursor: 'pointer',
  border: active ? `1px solid ${C.borderHi}` : `1px solid ${C.border}`,
  backgroundColor: active ? 'rgba(212,184,90,0.12)' : C.surface,
  color: active ? C.text : C.muted,
  transition: 'border-color 0.18s, color 0.18s, background-color 0.18s',
})

export const errorBanner: CSSProperties = {
  marginTop: 12,
  borderRadius: 8,
  border: '1px solid rgba(232,122,106,0.4)',
  backgroundColor: 'rgba(232,122,106,0.1)',
  padding: '8px 12px',
  fontSize: 11,
  color: C.danger,
}

export const okBanner: CSSProperties = {
  marginTop: 12,
  borderRadius: 8,
  border: '1px solid rgba(212,184,90,0.4)',
  backgroundColor: 'rgba(212,184,90,0.08)',
  padding: '8px 12px',
  fontSize: 11,
  color: C.accent,
}

export const tinyLabel: CSSProperties = {
  fontSize: 10,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  fontFamily: "ui-monospace, 'SF Mono', monospace",
  color: C.muted,
}
