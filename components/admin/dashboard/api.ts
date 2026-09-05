export async function adminApi<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error ?? "Request failed.");
  return json as T;
}
