type QueryResponse<T = unknown> = Promise<{ data: T; error: any }>;

export class MockSupabase {
  constructor(private readonly eventsRows: Record<string, unknown>[]) {}

  eventPriceHourlyUpserts: Record<string, unknown>[] = [];
  pollerRunEventsUpserts: Record<string, unknown>[] = [];
  pollerRunsUpdates: Record<string, unknown>[] = [];

  from(table: string) {
    const self = this;

    return {
      select(_columns: string) {
        if (table === "events") {
          return {
            order(_by: string): QueryResponse<Record<string, unknown>[]> {
              return Promise.resolve({
                data: self.eventsRows,
                error: null,
              });
            },
          };
        }

        if (table === "event_price_hourly") {
          return {
            eq(_k: string, _v: unknown) {
              return {
                order(_by: string, _opts: unknown) {
                  return {
                    limit(_n: number) {
                      return {
                        maybeSingle(): QueryResponse<null> {
                          return Promise.resolve({ data: null, error: null });
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }

        throw new Error(`Unhandled select() table mock: ${table}`);
      },

      update(row: Record<string, unknown>) {
        if (table !== "poller_runs") {
          throw new Error(`Unhandled update() table mock: ${table}`);
        }
        self.pollerRunsUpdates.push(row);
        return {
          eq(_k: string, _v: unknown): QueryResponse<null> {
            return Promise.resolve({ data: null, error: null });
          },
        };
      },

      upsert(row: Record<string, unknown>, _opts?: Record<string, unknown>) {
        if (table === "event_price_hourly") {
          self.eventPriceHourlyUpserts.push(row);
          return Promise.resolve({ data: null, error: null });
        }
        if (table === "poller_run_events") {
          self.pollerRunEventsUpserts.push(row);
          return Promise.resolve({ data: null, error: null });
        }
        throw new Error(`Unhandled upsert() table mock: ${table}`);
      },
    };
  }
}

