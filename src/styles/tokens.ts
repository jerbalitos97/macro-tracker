import type { CSSProperties } from 'react'

type Styles = Record<string, CSSProperties>

export const s: Styles = {
  /* ── Layout ─────────────────────────────────────────────────────────────── */
  app: {
    minHeight: '100vh',
    backgroundColor: '#0a0a0a',
    color: '#ebebeb',
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Monaco, Consolas, monospace",
    maxWidth: 480,
    margin: '0 auto',
    paddingBottom: 48,
  },

  loading: {
    minHeight: '100vh',
    backgroundColor: '#0a0a0a',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },

  /* ── NavBar ──────────────────────────────────────────────────────────────── */
  navBar: {
    display: 'flex',
    position: 'sticky',
    top: 0,
    zIndex: 10,
    backgroundColor: 'rgba(10,10,10,0.88)',
    backdropFilter: 'blur(24px) saturate(1.5)',
    WebkitBackdropFilter: 'blur(24px) saturate(1.5)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },

  navBtn: {
    flex: 1,
    padding: '9px 0 11px',
    backgroundColor: 'transparent',
    border: 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
    cursor: 'pointer',
    minWidth: 'auto',
    minHeight: 'auto',
  },

  /* ── Content wrapper ────────────────────────────────────────────────────── */
  content: {
    padding: '16px 16px 8px',
  },

  /* ── Page header ────────────────────────────────────────────────────────── */
  dateHeader: {
    marginBottom: 16,
  },
  dateMain: {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: '-0.025em',
    color: '#ebebeb',
  },
  dateSub: {
    fontSize: 11,
    color: '#555',
    marginTop: 3,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
  },

  /* ── Card ───────────────────────────────────────────────────────────────── */
  card: {
    backgroundColor: '#131313',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 12,
    padding: 16,
  },
  cardLabel: {
    fontSize: 10,
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    marginBottom: 10,
    fontWeight: 500,
  },
  sectionLabel: {
    fontSize: 10,
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    marginBottom: 8,
    fontWeight: 500,
  },

  /* ── Numbers ─────────────────────────────────────────────────────────────── */
  bigNumber: {
    fontSize: 40,
    fontWeight: 800,
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.03em',
  },
  unit: {
    fontSize: 14,
    color: '#555',
    fontWeight: 400,
    letterSpacing: '0',
  },

  /* ── Progress bar ────────────────────────────────────────────────────────── */
  progressBg: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 12,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    transition: 'width 0.45s cubic-bezier(0.16, 1, 0.3, 1)',
  },

  /* ── Stats row ───────────────────────────────────────────────────────────── */
  statsRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 10,
    fontSize: 12,
  },
  statNum: {
    color: '#ebebeb',
    fontVariantNumeric: 'tabular-nums',
  },
  statLabel: {
    color: '#555',
  },

  /* ── Note badge ──────────────────────────────────────────────────────────── */
  noteBadge: {
    marginTop: 12,
    fontSize: 11,
    color: '#d4b85a',
    padding: '5px 10px',
    backgroundColor: 'rgba(212,184,90,0.08)',
    borderRadius: 8,
    border: '1px solid rgba(212,184,90,0.15)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
  },

  /* ── Protein ─────────────────────────────────────────────────────────────── */
  proteinRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  proteinBig: {
    fontSize: 28,
    fontWeight: 700,
    color: '#6a9ad4',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.02em',
  },
  proteinUnit: {
    fontSize: 12,
    color: '#555',
    fontWeight: 400,
  },

  /* ── Meal row ────────────────────────────────────────────────────────────── */
  mealRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '11px 0',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  mealKcal: {
    fontSize: 13,
    color: '#ebebeb',
    fontWeight: 600,
    marginRight: 10,
    fontVariantNumeric: 'tabular-nums',
  },
  mealProtein: {
    fontSize: 11,
    color: '#6a9ad4',
    fontVariantNumeric: 'tabular-nums',
  },

  /* ── Icon button ─────────────────────────────────────────────────────────── */
  iconBtn: {
    background: 'transparent',
    border: 'none',
    color: '#444',
    cursor: 'pointer',
    padding: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    minHeight: 'auto',
    minWidth: 'auto',
  },

  /* ── Add button (dashed) ─────────────────────────────────────────────────── */
  addBtn: {
    width: '100%',
    padding: '13px 16px',
    marginTop: 12,
    backgroundColor: 'transparent',
    border: '1px dashed rgba(255,255,255,0.12)',
    borderRadius: 10,
    color: '#666',
    fontSize: 13,
    fontFamily: 'inherit',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    letterSpacing: '0.02em',
  },

  /* ── Buttons ─────────────────────────────────────────────────────────────── */
  primaryBtn: {
    flex: 1,
    padding: '12px 16px',
    backgroundColor: '#d4b85a',
    color: '#0a0a0a',
    border: 'none',
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
    letterSpacing: '0.03em',
  },
  secondaryBtn: {
    flex: 1,
    padding: '12px 16px',
    backgroundColor: 'rgba(255,255,255,0.07)',
    color: '#ebebeb',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    fontSize: 13,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  ghostBtn: {
    padding: '12px 16px',
    backgroundColor: 'transparent',
    color: '#666',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    fontSize: 13,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  actionBtn: {
    padding: '11px 14px',
    backgroundColor: '#131313',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    color: '#ebebeb',
    fontSize: 12,
    fontFamily: 'inherit',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },

  /* ── Input ───────────────────────────────────────────────────────────────── */
  input: {
    width: '100%',
    padding: '11px 13px',
    backgroundColor: 'rgba(0,0,0,0.45)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 8,
    color: '#ebebeb',
    fontFamily: 'inherit',
    fontSize: 14,
    marginTop: 5,
    marginBottom: 8,
    boxSizing: 'border-box',
    colorScheme: 'dark',
  },
  inputLabel: {
    fontSize: 10,
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    display: 'block',
    marginTop: 4,
    fontWeight: 500,
  },

  /* ── Calendar grid ───────────────────────────────────────────────────────── */
  weekHeader: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 2,
    marginBottom: 3,
  },
  weekHeaderCell: {
    textAlign: 'center',
    fontSize: 9,
    color: '#444',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    padding: '4px 0',
  },
  weekRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 2,
    marginBottom: 2,
  },
  dayCell: {
    aspectRatio: '1',
    backgroundColor: 'transparent',
    border: '1px solid transparent',
    borderRadius: 8,
    position: 'relative',
  },
  dayCellBtn: {
    cursor: 'pointer',
    fontFamily: 'inherit',
    color: '#777',
    padding: 0,
    border: '1px solid rgba(255,255,255,0.05)',
    backgroundColor: '#0f0f0f',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  dayCellSelected: {
    border: '1px solid rgba(212,184,90,0.6)',
    backgroundColor: 'rgba(212,184,90,0.08)',
    color: '#d4b85a',
  },
  dayCellToday: {
    fontWeight: 700,
    color: '#ebebeb',
  },
  dayNum: {
    fontSize: 12,
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
  },
  dayDots: {
    display: 'flex',
    gap: 2,
    marginTop: 3,
    height: 4,
    alignItems: 'center',
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: '50%',
    display: 'inline-block',
  },

  /* ── Breakdown row ───────────────────────────────────────────────────────── */
  breakdownRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '5px 0',
    fontSize: 12,
  },
  breakdownLabel: {
    color: '#777',
  },
  breakdownVal: {
    fontVariantNumeric: 'tabular-nums',
    color: '#ebebeb',
  },

  /* ── Modal – bottom sheet ────────────────────────────────────────────────── */
  modalBg: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.72)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 100,
    animation: 'backdropIn 0.22s ease both',
  },
  modal: {
    backgroundColor: '#181818',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: '20px 20px 0 0',
    padding: '24px 20px 40px',
    width: '100%',
    maxWidth: 480,
    boxShadow: '0 -16px 60px rgba(0,0,0,0.70)',
  },
  modalTitle: {
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 18,
    color: '#d4b85a',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },

  /* ── Toggle buttons ──────────────────────────────────────────────────────── */
  toggleBtn: {
    padding: '9px 6px',
    backgroundColor: 'rgba(0,0,0,0.3)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8,
    color: '#777',
    fontSize: 11,
    fontFamily: 'inherit',
    cursor: 'pointer',
    textAlign: 'center',
  },
  toggleBtnActive: {
    backgroundColor: 'rgba(212,184,90,0.10)',
    border: '1px solid rgba(212,184,90,0.35)',
    color: '#d4b85a',
  },
}
