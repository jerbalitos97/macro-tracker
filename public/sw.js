// Bump this string on every deploy to expire old caches.
const CACHE = 'makrot-v2'

const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
]

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  if (!e.request.url.startsWith(self.location.origin)) return

  const url = new URL(e.request.url)

  // ── HTML navigation: network-first ──────────────────────────────────────
  // Always try to fetch a fresh index.html so new deploys are picked up
  // immediately. Fall back to cache only when offline.
  if (e.request.mode === 'navigate' || url.pathname === '/index.html' || url.pathname === '/') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE).then((c) => c.put(e.request, clone))
          }
          return res
        })
        .catch(() => caches.match('/index.html'))
    )
    return
  }

  // ── Hashed assets (JS/CSS/PNG): cache-first ──────────────────────────────
  // Vite fingerprints filenames, so a cache hit is always correct.
  // New assets get different filenames → auto cache-miss on deploy.
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached
      return fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE).then((c) => c.put(e.request, clone))
          }
          return res
        })
        .catch(() => {
          // For icon/asset failures offline, just let it fail gracefully
        })
    })
  )
})
