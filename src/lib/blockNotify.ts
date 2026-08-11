// Daily reminder that the current training block is about to end.
//
// Delivery limitation, stated plainly: iOS has no scheduled-notification API
// for web apps (no Notification Triggers, no Periodic Background Sync), so a
// notification can only be raised while the app is running. This module fires
// at most once per calendar day — on open and on each return to the
// foreground — and records the day so re-opening doesn't nag again. Genuine
// background delivery (phone in pocket, app closed) needs Web Push with a
// server-side scheduler; see blockPushNote in the UI.
import { toISO } from './dates'
import type { BlockStatus } from './blocks'

const K_LAST_NOTIFIED = 'mimir.workouts.blockNotify:v1'

export type NotifyPermission = 'unsupported' | 'default' | 'granted' | 'denied'

export function notifyPermission(): NotifyPermission {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission as NotifyPermission
}

export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (typeof Notification === 'undefined') return 'unsupported'
  try {
    return (await Notification.requestPermission()) as NotifyPermission
  } catch {
    return notifyPermission()
  }
}

function lastNotifiedDay(): string | null {
  try {
    return localStorage.getItem(K_LAST_NOTIFIED)
  } catch {
    return null
  }
}

function rememberNotifiedDay(dayISO: string): void {
  try {
    localStorage.setItem(K_LAST_NOTIFIED, dayISO)
  } catch {
    // best-effort
  }
}

export function blockReminderText(status: BlockStatus): { title: string; body: string } | null {
  if (!status.current || status.daysLeft === null || !status.endingSoon) return null
  const d = status.daysLeft
  const when = d === 1 ? 'päättyy huomenna' : `päättyy ${d} päivän päästä`
  const nextPart = status.next
    ? ` Seuraava: ${status.next.name || 'nimetön blokki'}.`
    : ' Seuraavaa blokkia ei ole vielä suunniteltu.'
  return {
    title: `${status.current.name || 'Treeniblokki'} ${when}`,
    body: `Aika suunnitella seuraava jakso.${nextPart}`,
  }
}

/** Fire today's reminder if one is due and hasn't fired yet. Returns true when
 *  a notification was actually shown. */
export function maybeNotifyBlockEnding(status: BlockStatus, todayISO = toISO(new Date())): boolean {
  if (notifyPermission() !== 'granted') return false
  if (lastNotifiedDay() === todayISO) return false
  const text = blockReminderText(status)
  if (!text) return false
  try {
    new Notification(text.title, {
      body: text.body,
      tag: 'block-ending',       // replaces yesterday's rather than stacking
      icon: '/icons/icon-192.png',
    })
    rememberNotifiedDay(todayISO)
    return true
  } catch {
    return false
  }
}

/** Clears the once-per-day guard — used when the block changes so a new
 *  block's countdown isn't suppressed by the old one's reminder. */
export function resetNotifyGuard(): void {
  try {
    localStorage.removeItem(K_LAST_NOTIFIED)
  } catch {
    // best-effort
  }
}
