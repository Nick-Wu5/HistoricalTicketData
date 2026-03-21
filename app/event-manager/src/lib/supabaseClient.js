import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

/**
 * Future Edge Function compatibility:
 * attach the current access token as Authorization: Bearer <jwt>.
 */
export async function getEdgeFunctionAuthHeaders() {
  if (!supabase) return {}
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {}
}

