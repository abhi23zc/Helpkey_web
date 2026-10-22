export async function adminApi<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  let json;
  try { json = await response.json(); }
  catch { throw new Error("Unable to read the server response. Please retry."); }
  if (!response.ok) {
    if (response.status === 401) throw new Error("Your session has expired. Sign in and retry.");
    if (response.status === 403) throw new Error("You do not have permission to review this property.");
    if (response.status === 404) throw new Error("Property or requested record not found.");
    throw new Error(typeof json.error === "string" ? json.error : json.error?.message ?? "Request failed. Please retry.");
  }
  return json as T;
}
