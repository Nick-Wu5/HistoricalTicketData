import { getEdgeFunctionAuthHeaders, supabase } from '../lib/supabaseClient.js'

/**
 * Calls Supabase Edge Function `te-events-proxy`.
 * Explicitly passes the Authorization header for publishable-key compatibility.
 */
export async function queryTeEventsProxy(payload) {
  if (!supabase) throw new Error('Supabase client is not configured.')

  const explicitAuthHeaders = await getEdgeFunctionAuthHeaders()

  const { data, error } = await supabase.functions.invoke('te-events-proxy', {
    body: payload,
    headers: explicitAuthHeaders,
  })

  if (error) throw new Error(error.message || 'Failed to query TE proxy')
  return data
}
