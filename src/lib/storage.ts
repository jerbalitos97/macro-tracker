import type { AppData } from '../types'

const STORAGE_KEY = 'cutdata:v1'

export type SaveStatus = 'ok' | 'quota' | 'error'

export function loadData(): AppData | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored) as AppData
  } catch {
    // parse error or storage unavailable
  }
  return null
}

export function saveData(data: AppData): SaveStatus {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    return 'ok'
  } catch (e) {
    if (
      e instanceof DOMException &&
      (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')
    ) {
      return 'quota'
    }
    return 'error'
  }
}

export function storageUsedBytes(data: AppData): number {
  try {
    return new TextEncoder().encode(JSON.stringify(data)).length
  } catch {
    return 0
  }
}

export function exportJSON(data: AppData): void {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const date = new Date().toISOString().split('T')[0]
  a.href = url
  a.download = `makrot-varmuuskopio-${date}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function importJSON(json: string): AppData | null {
  try {
    const data = JSON.parse(json)
    if (!isValidAppData(data)) return null
    return data
  } catch {
    return null
  }
}

function isValidAppData(data: unknown): data is AppData {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  return (
    d.settings !== null &&
    typeof d.settings === 'object' &&
    Array.isArray(d.events) &&
    Array.isArray(d.extras) &&
    Array.isArray(d.meals) &&
    Array.isArray(d.weights)
  )
}
