import type { TeClientLike } from "../../supabase/functions/refresh-event-metadata/core.ts";

export type TeEventPayload = {
  id?: number;
  name: string;
  occurs_at: string;
  venue?: { city?: string; state_code?: string; state?: string; name?: string };
  category?: { short_name?: string; slug?: string; name?: string };
  taxonomy?: { short_name?: string; slug?: string; name?: string };
  timezone?: string;
};

/**
 * Mock TE events API (GET /events/:id) for metadata refresh tests.
 */
export class MockTeEventsClient implements TeClientLike {
  calls: Array<{ path: string }> = [];

  constructor(
    private eventsByTeId: Record<number, TeEventPayload | { _throw: string }>,
  ) {}

  get(path: string) {
    this.calls.push({ path });
    const match = path.match(/^\/events\/(\d+)$/);
    if (!match) {
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    }
    const teId = Number.parseInt(match[1], 10);
    const evt = this.eventsByTeId[teId];
    if (!evt) {
      return Promise.reject(new Error(`No mock for event ${teId}`));
    }
    if ("_throw" in evt) {
      return Promise.reject(new Error(evt._throw));
    }
    const payload = { ...evt, id: evt.id ?? teId };
    return Promise.resolve({ event: payload });
  }
}
