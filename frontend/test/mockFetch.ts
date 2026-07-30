export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

export function mockFetch(handler: (call: RecordedCall) => { status: number; body: unknown }) {
  const calls: RecordedCall[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: unknown, init?: unknown) => {
    const url = String(input);
    const requestInit = (init ?? {}) as { method?: string; headers?: Record<string, string>; body?: string };
    const call: RecordedCall = {
      url,
      method: requestInit.method ?? "GET",
      headers: requestInit.headers ?? {},
      body: requestInit.body ? JSON.parse(requestInit.body) : undefined,
    };
    calls.push(call);

    const { status, body } = handler(call);
    const isNoContent = status === 204;

    return {
      status,
      ok: status >= 200 && status < 300,
      headers: {
        get: (name: string) => (name.toLowerCase() === "content-type" && !isNoContent ? "application/json" : null),
      },
      json: async () => body,
      text: async () => String(body),
    } as unknown as Response;
  }) as typeof fetch;

  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}
