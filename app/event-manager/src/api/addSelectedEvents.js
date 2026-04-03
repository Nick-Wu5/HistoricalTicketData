import { getEdgeFunctionAuthHeaders, supabase } from '../lib/supabaseClient.js'

/** Keeps each Edge Function request small (URL + JSON body limits) for large “select all” batches. */
const ADD_EVENTS_PROXY_BATCH_SIZE = 400

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

  const explicitAuthHeaders = await getEdgeFunctionAuthHeaders()

  let addedCount = 0
  let duplicateCount = 0
  const addedIds = []
  const duplicateIds = []

  for (let offset = 0; offset < normalizedSelected.length; offset += ADD_EVENTS_PROXY_BATCH_SIZE) {
    const batchIds = normalizedSelected.slice(offset, offset + ADD_EVENTS_PROXY_BATCH_SIZE)
    const teEvents = batchIds.map(
      (id) => teEventsById?.[id] ?? previewById.get(id) ?? { te_event_id: id },
    )
    const { data, error } = await supabase.functions.invoke('add-events-proxy', {
      body: {
        selected_ids: batchIds,
        te_events: teEvents,
      },
      headers: explicitAuthHeaders,
    })
    if (error) throw new Error(error.message || 'Failed to insert selected events')
    addedCount += Number.parseInt(String(data?.added_count ?? 0), 10) || 0
    duplicateCount += Number.parseInt(String(data?.duplicate_count ?? 0), 10) || 0
    if (Array.isArray(data?.added_ids)) addedIds.push(...data.added_ids)
    if (Array.isArray(data?.duplicate_ids)) duplicateIds.push(...data.duplicate_ids)
  }

  return {
    addedCount,
    duplicateCount,
    addedIds,
    duplicateIds,
  }
}
