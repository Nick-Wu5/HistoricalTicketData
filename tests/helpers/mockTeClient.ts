export const VALID_LISTING = {
  id: "listing-1",
  type: "event",
  retail_price: 120,
  available_quantity: 2,
  splits: [2],
} as const;

export class MockTeClient {
  calls: Array<{ path: string; params: Record<string, string> }> = [];

  get(path: string, params: Record<string, string>) {
    this.calls.push({ path, params });
    return Promise.resolve({
      listings: [VALID_LISTING],
    });
  }
}

/** Per-event TE response: valid listings => succeeded, empty/ineligible => skipped, _throw => failed */
export type TeMockBehavior =
  | { listings: unknown[] }
  | { _throw: string };

export class ConfigurableMockTeClient {
  calls: Array<{ path: string; params: Record<string, string> }> = [];

  constructor(private behaviorByEventId: Record<string, TeMockBehavior>) {}

  get(path: string, params: Record<string, string>) {
    this.calls.push({ path, params });
    const eventId = params.event_id;
    const behavior = this.behaviorByEventId[eventId];
    if (!behavior) {
      throw new Error(`No mock behavior for event ${eventId}`);
    }
    if ("_throw" in behavior) {
      return Promise.reject(new Error(behavior._throw));
    }
    return Promise.resolve({ listings: behavior.listings });
  }
}

/**
 * TE mock that uses a sequence of behaviors per event.
 * Each call consumes the next item; after the sequence is exhausted, reuses the last item.
 * Use for retry tests: e.g. [{ _throw: "503" }, { _throw: "429" }, { listings: [VALID_LISTING] }]
 */
export class SequentialMockTeClient {
  calls: Array<{ path: string; params: Record<string, string> }> = [];
  private indices: Record<string, number> = {};

  constructor(
    private behaviorSequences: Record<string, TeMockBehavior[]>,
  ) {}

  get(path: string, params: Record<string, string>) {
    this.calls.push({ path, params });
    const eventId = params.event_id;
    const seq = this.behaviorSequences[eventId];
    if (!seq || seq.length === 0) {
      throw new Error(`No mock sequence for event ${eventId}`);
    }
    const idx = this.indices[eventId] ?? 0;
    this.indices[eventId] = idx + 1;
    const behavior = seq[Math.min(idx, seq.length - 1)];
    if ("_throw" in behavior) {
      return Promise.reject(new Error(behavior._throw));
    }
    return Promise.resolve({ listings: behavior.listings });
  }
}
