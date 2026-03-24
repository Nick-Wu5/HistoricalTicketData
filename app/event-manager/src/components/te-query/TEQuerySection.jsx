import { TEQueryForm } from './TEQueryForm.jsx'
import { TEPreviewSection } from '../te-preview/TEPreviewSection.jsx'
import { Toast } from '../shared/Toast.jsx'
import { supabase } from '../../lib/supabaseClient.js'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { addSelectedEventsFromPreview } from '../../api/addSelectedEvents.js'
import { useViewportPageSize } from '../../hooks/useViewportPageSize.js'

export function TEQuerySection() {
  const previewPageSize = useViewportPageSize()
  const [mode, setMode] = useState('single')
  const [previewRows, setPreviewRows] = useState([])
  const [previewPage, setPreviewPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState([])
  const [teEventsById, setTeEventsById] = useState({})
  const [adding, setAdding] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [toastVariant, setToastVariant] = useState('success')
  /** Client-side title filter (substring, case-insensitive); does not call the API. */
  const [titleFilter, setTitleFilter] = useState('')

  const clearToast = useCallback(() => setToastMsg(''), [])

  async function handleQuerySuccess(events) {
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
    setTitleFilter('')
  }

  const filteredPreviewRows = useMemo(() => {
    const q = titleFilter.trim().toLowerCase()
    if (!q) return previewRows
    return previewRows.filter((row) =>
      String(row.title ?? '').toLowerCase().includes(q),
    )
  }, [previewRows, titleFilter])

  const previewTotal = filteredPreviewRows.length
  const loadedCount = previewRows.length
  const previewTotalPages = Math.max(1, Math.ceil(previewTotal / previewPageSize))

  const previewPageRows = useMemo(() => {
    const from = (previewPage - 1) * previewPageSize
    return filteredPreviewRows.slice(from, from + previewPageSize)
  }, [filteredPreviewRows, previewPage, previewPageSize])

  useEffect(() => {
    setPreviewPage(1)
  }, [titleFilter])

  useEffect(() => {
    if (previewPage > previewTotalPages) setPreviewPage(previewTotalPages)
  }, [previewPage, previewTotalPages])

  async function handleAddSelected() {
    if (adding || selectedIds.length === 0) return
    setAdding(true)
    try {
      const result = await addSelectedEventsFromPreview({
        selectedIds,
        previewRows,
        teEventsById,
      })
      const addedCount = result?.addedCount ?? 0
      const duplicateCount = result?.duplicateCount ?? 0

      if (addedCount > 0 && duplicateCount === 0) {
        setToastVariant('success')
        setToastMsg(`Added ${addedCount} event${addedCount === 1 ? '' : 's'}`)
      } else if (addedCount > 0 && duplicateCount > 0) {
        setToastVariant('success')
        setToastMsg(`Added ${addedCount}, skipped ${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'}`)
      } else {
        setToastVariant('empty')
        setToastMsg('All selected events already tracked')
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
      setToastVariant('error')
      setToastMsg(err instanceof Error ? err.message : 'Failed to add events')
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

  function selectAll() {
    const selectable = filteredPreviewRows
      .filter((row) => !row.alreadyAdded)
      .map((row) => row.te_event_id)
    setSelectedIds(selectable)
  }

  const totalSelectable = filteredPreviewRows.filter((row) => !row.alreadyAdded).length

  function handlePreviewPrevPage() {
    setPreviewPage((p) => Math.max(1, p - 1))
  }

  function handlePreviewNextPage() {
    setPreviewPage((p) => Math.min(previewTotalPages, p + 1))
  }

  return (
    <div className="em-stack em-stack--add-events">
      <div className="em-tab-toolbar">
        <p className="em-tab-hint">Fetch and preview Ticket Evolution events before adding</p>
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
      </div>
      <TEQueryForm mode={mode} onQuerySuccess={handleQuerySuccess} />
      <TEPreviewSection
        rows={previewPageRows}
        totalPreviewRows={previewTotal}
        loadedCount={loadedCount}
        page={previewPage}
        pageSize={previewPageSize}
        onPrevPage={handlePreviewPrevPage}
        onNextPage={handlePreviewNextPage}
        selectedIds={selectedIds}
        onToggleSelected={toggleSelected}
        onClearSelection={clearSelection}
        onSelectAll={selectAll}
        totalSelectable={totalSelectable}
        onAddSelected={handleAddSelected}
        adding={adding}
        titleFilter={titleFilter}
        onTitleFilterChange={setTitleFilter}
        onClearTitleFilter={() => setTitleFilter('')}
      />
      <Toast message={toastMsg} variant={toastVariant} onDone={clearToast} />
    </div>
  )
}
