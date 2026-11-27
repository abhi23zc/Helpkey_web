import { decodeCursor, encodeCursor } from "../api/pagination";

/** Bound reads without losing a continuation when post-filters are sparse. */
export async function scanFinancePage<T>(options: {
  query: FirebaseFirestore.Query;
  cursor: ReturnType<typeof decodeCursor> | null;
  fingerprint: string;
  limit: number;
  matches: (row: T) => boolean;
  sortValues: (row: T) => string[];
  maxExamined?: number;
}) {
  const { query, cursor, fingerprint, limit, matches, sortValues } = options;
  const maxExamined = options.maxExamined ?? 250;
  const items: T[] = [];
  let after = cursor ? [...cursor.values.slice(1), cursor.id] : null;
  let examined = 0;
  let last: { row: T; id: string } | null = null;
  let hasMore = false;
  while (examined < maxExamined && items.length < limit) {
    const size = Math.min(limit + 1, maxExamined - examined);
    const page = await (after ? query.startAfter(...after) : query).limit(size).get();
    if (page.empty) break;
    for (let i = 0; i < page.docs.length; i++) {
      const doc = page.docs[i];
      const row = doc.data() as T;
      last = { row, id: doc.id };
      examined++;
      if (matches(row)) items.push(row);
      if (items.length === limit || examined === maxExamined) {
        // A full read may have further matches, even if this page has none.
        hasMore = i < page.docs.length - 1 || page.size === size;
        break;
      }
    }
    if (items.length === limit || examined === maxExamined || page.size < size) break;
    after = [...sortValues(last!.row), last!.id];
  }
  return {
    items,
    nextCursor: hasMore && last
      ? encodeCursor({ values: [fingerprint, ...sortValues(last.row)], id: last.id })
      : null,
  };
}

export function validFinanceDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}
