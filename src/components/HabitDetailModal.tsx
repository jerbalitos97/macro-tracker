import { useState } from 'react'
import { ChevronLeft, MoreHorizontal, Plus, Minus, Check, Pencil, Archive } from 'lucide-react'
import type { Habit, HabitEntry } from '../types'
import { addDays, fromISO } from '../lib/dates'
import { useBodyScrollLock } from '../lib/useBodyScrollLock'
import { HabitProgressRing } from './HabitProgressRing'
import { s } from '../styles/tokens'

interface Props {
  habit: Habit
  entries: HabitEntry[]
  todayValue: number
  todayISO: string
  onIncrement: (delta: number) => void
  onSetBinary: (done: boolean) => void
  onEdit: () => void
  onArchive: () => void
  onClose: () => void
}

export function HabitDetailModal({
  habit,
  entries,
  todayValue,
  todayISO,
  onIncrement,
  onSetBinary,
  onEdit,
  onArchive,
  onClose,
}: Props) {
  useBodyScrollLock()
  const [menuOpen, setMenuOpen] = useState(false)

  const goal = habit.goalValue
  const pct = goal > 0 ? Math.min(1, todayValue / goal) : 0
  const reached = todayValue >= goal && goal > 0
  const isBinary = habit.goalUnit === 'binary'

  // Last 7 days strip (oldest → newest, ending today)
  const days: { date: string; value: number; reached: boolean }[] = []
  for (let i = 6; i >= 0; i--) {
    const date = addDays(todayISO, -i)
    const e = entries.find((x) => x.habitId === habit.id && x.date === date)
    const v = e?.value ?? 0
    days.push({ date, value: v, reached: v >= goal && goal > 0 })
  }
  const dayLetter = (iso: string) =>
    fromISO(iso).toLocaleDateString('fi-FI', { weekday: 'narrow' }).toUpperCase()

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#0a0a0a',
        zIndex: 200,
        overflowY: 'auto',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'calc(48px + env(safe-area-inset-bottom))',
        animation: 'viewFadeIn 0.22s var(--ease-out) both',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px 6px',
        }}
      >
        <button onClick={onClose} style={{ ...s.iconBtn, color: '#fff' }} aria-label="Takaisin">
          <ChevronLeft size={22} />
        </button>
        <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#fff',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              padding: '0 8px',
            }}
          >
            {habit.name}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
            {habit.goalPeriod === 'day' ? 'Päivätavoite' : 'Viikkotavoite'}
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            style={{ ...s.iconBtn, color: '#fff' }}
            aria-label="Lisätoiminnot"
          >
            <MoreHorizontal size={20} />
          </button>
          {menuOpen && (
            <>
              <div
                onClick={() => setMenuOpen(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 1 }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 38,
                  right: 0,
                  backgroundColor: '#181818',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10,
                  padding: 4,
                  minWidth: 160,
                  zIndex: 2,
                  boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                }}
              >
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    onEdit()
                  }}
                  style={menuItem}
                >
                  <Pencil size={13} />
                  Muokkaa
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    onArchive()
                  }}
                  style={{ ...menuItem, color: '#e87a6a' }}
                >
                  <Archive size={13} />
                  Arkistoi
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Progress ring */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '24px 16px 16px',
        }}
      >
        <div style={{ position: 'relative', width: 200, height: 200 }}>
          <HabitProgressRing value={todayValue} goal={goal} color={habit.color} size={200} strokeWidth={14} />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {reached && <Check size={28} color={habit.color} style={{ marginBottom: 4 }} />}
            <div
              style={{
                fontSize: 38,
                fontWeight: 800,
                color: '#fff',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-0.02em',
                lineHeight: 1,
              }}
            >
              {todayValue}
              <span style={{ color: '#555', fontSize: 22, fontWeight: 600 }}> / {goal}</span>
            </div>
            <div
              style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.4)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginTop: 8,
              }}
            >
              {Math.round(pct * 100)} %
            </div>
          </div>
        </div>

        {habit.description && (
          <p
            style={{
              margin: '14px 0 0',
              fontSize: 12,
              color: 'rgba(255,255,255,0.5)',
              textAlign: 'center',
              maxWidth: 320,
              lineHeight: 1.5,
            }}
          >
            {habit.description}
          </p>
        )}
      </div>

      {/* Counter controls */}
      <div style={{ padding: '16px 16px' }}>
        {isBinary ? (
          <button
            onClick={() => onSetBinary(!reached)}
            style={{
              width: '100%',
              padding: '16px',
              borderRadius: 14,
              border: 'none',
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '0.02em',
              cursor: 'pointer',
              backgroundColor: reached ? habit.color : 'rgba(255,255,255,0.06)',
              color: reached ? '#0a0a0a' : '#ebebeb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {reached ? (
              <>
                <Check size={16} />
                Tehty
              </>
            ) : (
              'Merkitse tehdyksi'
            )}
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
            <button
              onClick={() => onIncrement(-1)}
              disabled={todayValue <= 0}
              style={{ ...counterBtn, opacity: todayValue <= 0 ? 0.3 : 1 }}
              aria-label="Vähennä"
            >
              <Minus size={20} />
            </button>
            <button
              onClick={() => onIncrement(+1)}
              style={{
                ...s.primaryBtn,
                flex: 0,
                padding: '14px 28px',
                backgroundColor: habit.color,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Plus size={16} />
              Lisää
            </button>
            <button
              onClick={() => onIncrement(+1)}
              style={counterBtn}
              aria-label="Kasvata"
            >
              <Plus size={20} />
            </button>
          </div>
        )}
      </div>

      {/* 7-day strip */}
      <div style={{ padding: '8px 16px 24px' }}>
        <div
          style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.35)',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            marginBottom: 8,
            fontFamily: "ui-monospace, 'SF Mono', monospace",
          }}
        >
          Viimeiset 7 päivää
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
          {days.map((d) => (
            <div
              key={d.date}
              style={{
                aspectRatio: '1',
                borderRadius: 10,
                border: d.date === todayISO ? `1px solid ${habit.color}` : '1px solid rgba(255,255,255,0.07)',
                backgroundColor: d.reached ? `${habit.color}22` : 'rgba(255,255,255,0.03)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  color: 'rgba(255,255,255,0.4)',
                  fontFamily: "ui-monospace, 'SF Mono', monospace",
                  textTransform: 'uppercase',
                }}
              >
                {dayLetter(d.date)}
              </div>
              {d.reached ? (
                <Check size={14} color={habit.color} />
              ) : (
                <div
                  style={{
                    fontSize: 11,
                    color: d.value > 0 ? '#fff' : 'rgba(255,255,255,0.3)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {d.value}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const menuItem: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  padding: '10px 12px',
  background: 'transparent',
  border: 'none',
  color: '#ebebeb',
  fontSize: 13,
  fontFamily: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
  borderRadius: 6,
  minHeight: 'auto',
}

const counterBtn: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 24,
  backgroundColor: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  padding: 0,
  minWidth: 0,
  minHeight: 0,
}
