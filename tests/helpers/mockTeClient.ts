export class MockTeClient {
  calls: Array<{ path: string; params: Record<string, string> }> = [];

  get(path: string, params: Record<string, string>) {
    this.calls.push({ path, params });
    return Promise.resolve({
      listings: [
        {
          id: "listing-1",
          type: "event",
          retail_price: 120,
          available_quantity: 2,
          splits: [2],
        },
      ],
    });
  }
}
