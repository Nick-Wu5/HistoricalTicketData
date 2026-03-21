/**
 * Event Manager data contracts — aligned with `supabase/database.types.ts` and
 * `scripts/populateEventsByPerformer.js` (`mapTeEventToUpsertRow`).
 *
 * Use `te_event_id` as `number` everywhere (parse with `parseTeEventId`).
 */

import type { Database } from '../../../../supabase/database.types'

/** Full row from `public.events` (Supabase source of truth for the tracked-events table). */
export type TrackedEventRow = Database['public']['Tables']['events']['Row']

/** Insert shape from generated types (optional fields per DB defaults). */
export type EventsInsert = Database['public']['Tables']['events']['Insert']

/**
 * Minimal TE preview row for the UI + duplicate indicator.
 * `ends_at` may be absent until mapped or supplied by TE.
 */
export type TEEventPreviewRow = {
  te_event_id: number
  title: string
  starts_at: string | null
  ends_at?: string | null
  /** Derived: exists in local `public.events` by `te_event_id`. */
  alreadyAdded: boolean
}

/**
 * Payload shape produced by `mapTeEventToUpsertRow` in `populateEventsByPerformer.js`
 * (insert-only-new flow should send objects matching this contract).
 *
 * Note: `created_at` is not set by the script (DB default / trigger if any).
 * `olt_url` is omitted when URL build fails.
 */
export type EventInsertFromTe = {
  te_event_id: number
  title: string
  starts_at: string
  ends_at: string
  polling_enabled: boolean
  ended_at: string | null
  updated_at: string
  olt_url?: string
}

/**
 * Compile-time check: `EventInsertFromTe` must be assignable to Supabase `Insert`.
 * If this errors, align `populateEventsByPerformer.js` / types with `database.types.ts`.
 */
type _AssertAssignableTo<SupabaseInsert, FromTe extends SupabaseInsert> = FromTe
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- compile-time insert contract vs Supabase
type _CheckEventInsertFromTe = _AssertAssignableTo<EventsInsert, EventInsertFromTe>

/**
 * Parse a TE event id for UI / forms. Prefer this over storing raw strings in state.
 * Returns `null` if not a positive finite integer.
 */
export function parseTeEventId(value: unknown): number | null {
  const n =
    typeof value === 'number'
      ? value
      : Number.parseInt(String(value ?? '').trim(), 10)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}
