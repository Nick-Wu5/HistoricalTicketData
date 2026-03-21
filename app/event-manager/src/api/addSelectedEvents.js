import { getEdgeFunctionAuthHeaders, supabase } from '../lib/supabaseClient.js'

export async function addSelectedEventsFromPreview({ selectedIds = [], previewRows = [], teEventsById = {} }) {
  if (!supabase) throw new Error('Supabase client is not configured.')
  const normalizedSelected = Array.from(
    new Set(
      selectedIds
        .map((id) => Number.parseInt(String(id ?? ''), 10))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  )

  if (normalizedSelected.length === 0) {
    return { addedCount: 0, duplicateCount: 0, addedIds: [], duplicateIds: [] }
  }

  const previewById = new Map(
    (previewRows ?? []).map((row) => [Number.parseInt(String(row?.te_event_id ?? ''), 10), row]),
  )
  const teEvents = normalizedSelected.map((id) => teEventsById?.[id] ?? previewById.get(id) ?? { te_event_id: id })
  const explicitAuthHeaders = await getEdgeFunctionAuthHeaders()
  const { data, error } = await supabase.functions.invoke('add-events-proxy', {
    body: {
      selected_ids: normalizedSelected,
      te_events: teEvents,
    },
    headers: explicitAuthHeaders,
  })
  if (error) throw new Error(error.message || 'Failed to insert selected events')
  return {
    addedCount: Number.parseInt(String(data?.added_count ?? 0), 10) || 0,
    duplicateCount: Number.parseInt(String(data?.duplicate_count ?? 0), 10) || 0,
    addedIds: Array.isArray(data?.added_ids) ? data.added_ids : [],
    duplicateIds: Array.isArray(data?.duplicate_ids) ? data.duplicate_ids : [],
  }
}
