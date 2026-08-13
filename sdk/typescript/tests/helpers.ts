export interface RecordedCall {
  url: string;
  init: RequestInit;
}

type MockAnswer = Response | ((url: string, init: RequestInit) => Response | Promise<Response>);

/** Queue-based fetch mock. Each answer serves one call; an exhausted queue throws. */
export function mockFetch(...answers: MockAnswer[]): { fetch: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const queue = [...answers];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const call: RecordedCall = { url, init: init ?? {} };
    calls.push(call);
    const next = queue.shift();
    if (next === undefined) {
      throw new Error(`mock fetch exhausted: no answer queued for ${url}`);
    }
    return typeof next === "function" ? next(url, call.init) : next;
  }) as typeof fetch;
  return { fetch: fetchImpl, calls };
}

export function okJson(
  data: unknown,
  init?: { status?: number; headers?: Record<string, string> },
): Response {
  return new Response(JSON.stringify({ ok: true, version: "v1", data }), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json", ...init?.headers },
  });
}

export function errJson(
  code: string,
  message: string,
  init?: { status?: number; headers?: Record<string, string> },
): Response {
  return new Response(JSON.stringify({ ok: false, version: "v1", error: { code, message } }), {
    status: init?.status ?? 400,
    headers: { "content-type": "application/json", ...init?.headers },
  });
}

export function headerOf(init: RequestInit, name: string): string | null {
  return new Headers(init.headers).get(name);
}

export const WALLET = `0x${"ab".repeat(20)}`;
