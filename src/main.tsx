import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App'
import { AuroraBackground } from './components/AuroraBackground'
import { AuthProvider } from './contexts/AuthContext'

// Register service worker for PWA / offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => console.log('[SW] registered:', reg.scope))
      .catch((err) => console.warn('[SW] registration failed:', err))

    // When a new SW takes over, reload to get the fresh assets
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload()
    })
  })
}

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <AuthProvider>
      <AuroraBackground />
      <App />
    </AuthProvider>
  </StrictMode>
)
