import { useEffect, useState } from 'react'
import { LoginPage } from './LoginPage.jsx'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js'

export function AuthGate({ children }) {
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [session, setSession] = useState(null)

  useEffect(() => {
    let isMounted = true
    if (!isSupabaseConfigured || !supabase) return () => {}

    supabase.auth.getSession().then(({ data }) => {
      console.info('[auth] initial session', {
        authenticated: Boolean(data?.session),
        userId: data?.session?.user?.id ?? null,
        email: data?.session?.user?.email ?? null,
        expiresAt: data?.session?.expires_at ?? null,
      })
      if (!isMounted) return
      setSession(data.session ?? null)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      console.info('[auth] state change', {
        event: _event,
        authenticated: Boolean(nextSession),
        userId: nextSession?.user?.id ?? null,
        email: nextSession?.user?.email ?? null,
        expiresAt: nextSession?.expires_at ?? null,
      })
      if (!isMounted) return
      setSession(nextSession ?? null)
      setLoading(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  if (loading) {
    return (
      <div className="em-auth-page">
        <div className="em-auth-card">Checking session…</div>
      </div>
    )
  }

  if (!session) return <LoginPage />
  return children
}

