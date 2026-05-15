import { useState } from 'react'
import { ChevronLeft, ChevronRight, PartyPopper, Dumbbell, Sliders, Trash2 } from 'lucide-react'
import type { ComputedResult, ComputedDay, SpecialEvent, ExtraWorkout } from '../types'
import { toISO, formatDateShort } from '../lib/dates'
import { CalendarGrid } from '../components/CalendarGrid'
import { DayBreakdown } from '../components/DayBreakdown'
import { UpcomingList } from '../components/UpcomingList'
import { EventModal } from '../components/EventModal'
import { ExtraModal } from '../components/ExtraModal'
import { AdjustmentModal } from '../components/AdjustmentModal'
import { s } from '../styles/tokens'

const DAY_TYPE_LABEL: Record<string, string> = {
  rest: 'Lepopäivä',
  single: '1 treeni',
  double: '2 treeniä',
  volleyball: 'Volleyball',
}

interface Props {
  computed: ComputedResult
  selectedDate: string
  setSelectedDate: (d: string) => void
  selectedDay: ComputedDay | undefined
  events: SpecialEvent[]
  extras: ExtraWorkout[]
  onAddEvent: (ev: Omit<SpecialEvent, 'id'>) => void
  onDeleteEvent: (id: number) => void
  onAddExtra: (ex: Omit<ExtraWorkout, 'id'>) => void
  onDeleteExtra: (id: number) => void
  onSetAdjustment: (date: string, kcal: number, note: string) => void
  onDeleteAdjustment: (id: number) => void
}

export function CalendarView({
  computed,
  selectedDate,
  setSelectedDate,
  selectedDay,
  events,
  extras,
  onAddEvent,
  onDeleteEvent,
  onAddExtra,
  onDeleteExtra,
  onSetAdjustment,
  onDeleteAdjustment,
}: Props) {
  const [modalType, setModalType] = useState<'event' | 'extra' | 'adjustment' | null>(null)
  const todayISO = toISO(new Date())

  const selectedIdx = computed.days.findIndex((d) => d.date === selectedDate)
  const goPrev = () => {
    if (selectedIdx > 0) setSelectedDate(computed.days[selectedIdx - 1].date)
  }
  const goNext = () => {
    if (selectedIdx < computed.days.length - 1)
      setSelectedDate(computed.days[selectedIdx + 1].date)
  }

  return (
    <div style={s.content}>
      <CalendarGrid
        days={computed.days}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
      />

      {selectedDay && (
        <div style={{ ...s.card, marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              onClick={goPrev}
              style={s.iconBtn}
              disabled={selectedIdx === 0}
            >
              <ChevronLeft size={16} />
            </button>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: '#888' }}>
                {formatDateShort(selectedDay.date)}
              </div>
              <div style={{ fontSize: 11, color: '#555' }}>
                {DAY_TYPE_LABEL[selectedDay.dayType]}
              </div>
            </div>
            <button
              onClick={goNext}
              style={s.iconBtn}
              disabled={selectedIdx === computed.days.length - 1}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #1f1f1f' }}>
            <DayBreakdown day={selectedDay} />
          </div>
          {selectedDay.events.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {selectedDay.events.map((e) => (
                <div key={e.id} style={s.noteBadge}>
                  🎉 {e.name}
                  <button
                    onClick={() => onDeleteEvent(e.id)}
                    style={{ ...s.iconBtn, marginLeft: 8, display: 'inline-flex' }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
        <button onClick={() => setModalType('event')} style={s.actionBtn}>
          <PartyPopper size={14} />
          Juhla
        </button>
        <button onClick={() => setModalType('extra')} style={s.actionBtn}>
          <Dumbbell size={14} />
          Treeni
        </button>
        <button onClick={() => setModalType('adjustment')} style={s.actionBtn}>
          <Sliders size={14} />
          Säätö
        </button>
      </div>

      <UpcomingList
        events={events}
        extras={extras}
        todayISO={todayISO}
        onDeleteEvent={onDeleteEvent}
        onDeleteExtra={onDeleteExtra}
      />

      {modalType === 'event' && (
        <EventModal
          defaultDate={selectedDate}
          onSave={(ev) => { onAddEvent(ev); setModalType(null) }}
          onClose={() => setModalType(null)}
        />
      )}
      {modalType === 'extra' && (
        <ExtraModal
          defaultDate={selectedDate}
          onSave={(ex) => { onAddExtra(ex); setModalType(null) }}
          onClose={() => setModalType(null)}
        />
      )}
      {modalType === 'adjustment' && (
        <AdjustmentModal
          date={selectedDate}
          current={
            selectedDay?.adjustment
              ? { kcal: selectedDay.adjustment.kcal, note: selectedDay.adjustment.note }
              : null
          }
          onSave={(kcal, note) => {
            onSetAdjustment(selectedDate, kcal, note)
            setModalType(null)
          }}
          onDelete={
            selectedDay?.adjustment
              ? () => {
                  onDeleteAdjustment(selectedDay.adjustment!.id)
                  setModalType(null)
                }
              : undefined
          }
          onClose={() => setModalType(null)}
        />
      )}
    </div>
  )
}
