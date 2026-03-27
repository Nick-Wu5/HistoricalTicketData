import { supabase } from '../lib/supabaseClient.js'
import { parseTeEventId } from '../types/contracts'

const TRACKED_EVENTS_PAGE_SIZE = 10

export async function fetchTrackedEvents({
  teEventId,
  eventName,
  page = 1,
  pageSize = TRACKED_EVENTS_PAGE_SIZE,
}) {
  if (!supabase) throw new Error('Supabase client is not configured.')

  const from = Math.max(0, (page - 1) * pageSize)
  const to = from + pageSize - 1

  let query = supabase
    .from('events')
    .select('*', { count: 'exact' })
    .order('te_event_id', { ascending: true })

  const parsedTeEventId = parseTeEventId(teEventId)
  const trimmedName = String(eventName ?? '').trim()

  // Requirement precedence:
  // 1) exact te_event_id search
  // 2) else partial title search
  if (parsedTeEventId) query = query.eq('te_event_id', parsedTeEventId)
  else if (trimmedName) query = query.ilike('title', `%${trimmedName}%`)

  const { data, error, count } = await query.range(from, to)
  if (error) throw new Error(error.message)

  return {
    rows: data ?? [],
    total: count ?? 0,
  }
}

