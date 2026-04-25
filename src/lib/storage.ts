import type { AppData } from '../types'

const STORAGE_KEY = 'cutdata:v1'

export function loadData(): AppData | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored) as AppData
  } catch {
    // no stored data
  }
  return null
}

export function saveData(data: AppData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (e) {
    console.error('Tallennus epäonnistui:', e)
  }
}
