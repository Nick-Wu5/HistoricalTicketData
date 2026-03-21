import { TEQueryForm } from './TEQueryForm.jsx'
import { TEPreviewSection } from '../te-preview/TEPreviewSection.jsx'
import { supabase } from '../../lib/supabaseClient.js'
import { useEffect, useMemo, useState } from 'react'
import { addSelectedEventsFromPreview } from '../../api/addSelectedEvents.js'
import { TRACKED_EVENTS_PAGE_SIZE } from '../../api/trackedEvents.js'
import { SectionHeader } from '../layout/SectionHeader.jsx'

export function TEQuerySection() {
  const [mode, setMode] = useState('single')
  const [previewRows, setPreviewRows] = useState([])
  const [previewPage, setPreviewPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState([])
  const [teEventsById, setTeEventsById] = useState({})
  const [adding, setAdding] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  async function handleQuerySuccess(events) {
    setStatusMessage('')
    setErrorMessage('')
    const eventRows = Array.isArray(events) ? events : []
    const nextEventsById = {}
    for (const event of eventRows) {
      const id = Number.parseInt(String(event?.te_event_id ?? event?.id ?? ''), 10)
      if (Number.isFinite(id) && id > 0) nextEventsById[id] = event
    }
    setTeEventsById(nextEventsById)
    const eventIds = eventRows
      .map((e) => Number.parseInt(String(e?.te_event_id ?? ''), 10))
      .filter((n) => Number.isFinite(n) && n > 0)

    let existingIds = new Set()
    if (supabase && eventIds.length > 0) {
      const { data, error } = await supabase
        .from('events')
        .select('te_event_id')
        .in('te_event_id', eventIds)
      if (!error) {
        existingIds = new Set(
          (data ?? [])
            .map((row) => Number.parseInt(String(row?.te_event_id ?? ''), 10))
            .filter((n) => Number.isFinite(n) && n > 0),
        )
      }
    }

    const rows = eventRows.map((event) => {
      const teEventId = Number.parseInt(String(event?.te_event_id ?? ''), 10)
      return {
        te_event_id: teEventId,
        title: event?.title ? String(event.title) : '',
        starts_at: event?.starts_at ? String(event.starts_at) : null,
        ends_at: event?.ends_at ? String(event.ends_at) : null,
        alreadyAdded: existingIds.has(teEventId),
      }
    })

    setPreviewRows(rows)
    setPreviewPage(1)
    setSelectedIds([])
  }

  const previewPageSize = TRACKED_EVENTS_PAGE_SIZE
  const previewTotal = previewRows.length
  const previewTotalPages = Math.max(1, Math.ceil(previewTotal / previewPageSize))

  const previewPageRows = useMemo(() => {
    const from = (previewPage - 1) * previewPageSize
    return previewRows.slice(from, from + previewPageSize)
  }, [previewRows, previewPage, previewPageSize])

  useEffect(() => {
    if (previewPage > previewTotalPages) setPreviewPage(previewTotalPages)
  }, [previewPage, previewTotalPages])

  async function handleAddSelected() {
    if (adding || selectedIds.length === 0) return
    setAdding(true)
    setStatusMessage('')
    setErrorMessage('')
    try {
      const result = await addSelectedEventsFromPreview({
        selectedIds,
        previewRows,
        teEventsById,
      })
      const addedCount = result?.addedCount ?? 0
      const duplicateCount = result?.duplicateCount ?? 0

      if (addedCount > 0 && duplicateCount === 0) {
        setStatusMessage(`Added ${addedCount} event(s).`)
      } else if (addedCount > 0 && duplicateCount > 0) {
        setStatusMessage(`Added ${addedCount}. Skipped ${duplicateCount} already in database.`)
      } else {
        setStatusMessage('No events added. All selected items are already in database.')
      }

      if (addedCount > 0) {
        const addedIdSet = new Set(result?.addedIds ?? [])
        setPreviewRows((prev) =>
          prev.map((row) => (addedIdSet.has(row.te_event_id) ? { ...row, alreadyAdded: true } : row)),
        )
        window.dispatchEvent(new CustomEvent('events:tracked-updated'))
      }
      setSelectedIds([])
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setAdding(false)
    }
  }

  function toggleSelected(teEventId) {
    setSelectedIds((prev) =>
      prev.includes(teEventId) ? prev.filter((id) => id !== teEventId) : [...prev, teEventId],
    )
  }

  function clearSelection() {
    setSelectedIds([])
  }

  function selectAllVisible() {
    const from = (previewPage - 1) * previewPageSize
    const pageSlice = previewRows.slice(from, from + previewPageSize)
    const selectable = pageSlice.filter((row) => !row.alreadyAdded).map((row) => row.te_event_id)
    setSelectedIds(selectable)
  }

  function handlePreviewPrevPage() {
    setPreviewPage((p) => Math.max(1, p - 1))
  }

  function handlePreviewNextPage() {
    setPreviewPage((p) => Math.min(previewTotalPages, p + 1))
  }

  return (
    <div className="em-stack em-stack--add-events">
      <SectionHeader
        className="em-section-header--add-events"
        title="Add Events"
        subtitle="Fetch and preview Ticket Evolution events before adding"
        rightActions={
          <div
            className="olt-toggle-group olt-toggle-group--dual"
            role="group"
            aria-label="Event query mode"
            data-active-index={mode === 'single' ? 0 : 1}
          >
            <span className="olt-toggle-pill" aria-hidden="true" />
            <button
              type="button"
              className="olt-toggle"
              onClick={() => setMode('single')}
              aria-pressed={mode === 'single'}
            >
              Single Event
            </button>
            <button
              type="button"
              className="olt-toggle"
              onClick={() => setMode('bulk')}
              aria-pressed={mode === 'bulk'}
            >
              Bulk Events
            </button>
          </div>
        }
      />
      <TEQueryForm mode={mode} onQuerySuccess={handleQuerySuccess} />
      <TEPreviewSection
        rows={previewPageRows}
        totalPreviewRows={previewTotal}
        page={previewPage}
        pageSize={previewPageSize}
        onPrevPage={handlePreviewPrevPage}
        onNextPage={handlePreviewNextPage}
        selectedIds={selectedIds}
        onToggleSelected={toggleSelected}
        onClearSelection={clearSelection}
        onSelectAllVisible={selectAllVisible}
        onAddSelected={handleAddSelected}
        adding={adding}
        statusMessage={statusMessage}
        errorMessage={errorMessage}
      />
    </div>
  )
}

