export class TimeoutError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`${label} timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

export function timeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout)
  };
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label = "Operation"
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new TimeoutError(label, timeoutMs)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeout!);
  }
}

export async function fetchJsonWithTimeout<T>(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 3000
): Promise<T> {
  const { signal, clear } = timeoutSignal(timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error ?? `Request failed with ${response.status}`);
    }
    return data as T;
  } finally {
    clear();
  }
}
