export class ApiClientError extends Error {
  constructor(public readonly status: number, public readonly code: string, message = code, public readonly requestId?: string) {
    super(message);
  }
}

export async function apiFetch<T>(input: RequestInfo | URL, init: RequestInit = {}): Promise<T> {
  const response = await fetch(input, { ...init, signal: init.signal });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const standard = (payload.apiError ?? payload.error) as { code?: string; message?: string } | string | undefined;
    const code = typeof standard === "string" ? standard : standard?.code ?? `HTTP_${response.status}`;
    const message = typeof standard === "string" ? standard : standard?.message ?? code;
    throw new ApiClientError(response.status, code, message, typeof payload.requestId === "string" ? payload.requestId : response.headers.get("x-request-id") ?? undefined);
  }
  return (payload.data ?? payload) as T;
}
