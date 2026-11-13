export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message = code,
    public readonly requestId?: string,
  ) {
    super(message);
  }
}

type ApiRequestInit = RequestInit & { timeoutMs?: number };

export async function apiFetch<T>(
  input: RequestInfo | URL,
  init: ApiRequestInit = {},
): Promise<T> {
  const { timeoutMs, ...request } = init;
  const controller =
    timeoutMs === undefined ? undefined : new AbortController();
  const caller =
    init.signal ??
    (typeof Request !== "undefined" && input instanceof Request
      ? input.signal
      : undefined);
  let timedOut = false;
  const cancel = () => controller?.abort(caller?.reason);
  if (caller?.aborted) cancel();
  else if (controller)
    caller?.addEventListener("abort", cancel, { once: true });
  const timer = controller
    ? setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs)
    : undefined;
  try {
    const response = await fetch(input, {
      ...request,
      signal: controller?.signal ?? init.signal,
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      const standard = (payload.apiError ?? payload.error) as
        { code?: string; message?: string } | string | undefined;
      const code =
        typeof standard === "string"
          ? standard
          : (standard?.code ?? `HTTP_${response.status}`);
      const message =
        typeof standard === "string" ? standard : (standard?.message ?? code);
      throw new ApiClientError(
        response.status,
        code,
        message,
        typeof payload.requestId === "string"
          ? payload.requestId
          : (response.headers.get("x-request-id") ?? undefined),
      );
    }
    return (payload.data ?? payload) as T;
  } catch (error) {
    if (timedOut && !caller?.aborted)
      throw new ApiClientError(
        408,
        "REQUEST_TIMEOUT",
        "This request is taking too long. Please try again.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
    caller?.removeEventListener("abort", cancel);
  }
}
