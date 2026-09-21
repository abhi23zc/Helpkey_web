/** Convert Firestore DTO values into React/JSON-safe primitives. */
export function toPlainJson<T>(value: T): T {
  if (value instanceof Date) return value.toISOString() as T;
  if (Array.isArray(value)) return value.map((item) => toPlainJson(item)) as T;
  if (value && typeof value === "object") {
    const candidate = value as { toDate?: unknown };
    if (typeof candidate.toDate === "function") return (candidate.toDate as () => Date)().toISOString() as T;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, toPlainJson(child)])) as T;
  }
  return value;
}
