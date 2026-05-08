import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Returns null when env vars are missing — app runs in local-only mode.
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          storageKey: 'makrot:session',
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null
