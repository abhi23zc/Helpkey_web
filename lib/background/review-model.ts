export type Contribution = { active: boolean; rating: number; time: number; awaiting: number; withPhotos: number; topics: string[] };
export type Totals = { count: number; ratingSum: number; awaiting: number; withPhotos: number; buckets: Record<string, number>; topicCounts: Record<string, number> };
const patterns: Array<[string, RegExp]> = [["Cleanliness", /\b(clean|cleanliness|spotless|hygiene)\b/i], ["Staff & service", /\b(staff|service|helpful|friendly|reception)\b/i], ["Breakfast", /\b(breakfast|food|dining)\b/i], ["Location", /\b(location|located|area|nearby)\b/i], ["Noise", /\b(noise|noisy|quiet|sound)\b/i], ["Check-in", /\b(check[ -]?in|arrival|wait)\b/i]];
export function contribution(data?: Record<string, unknown>): Contribution {
  const rating = Number(data?.rating);
  const active = data?.status === "approved" && Number.isInteger(rating) && rating >= 1 && rating <= 5;
  const timestamp = (data?.submittedAt ?? data?.updatedAt) as { toMillis?: () => number } | undefined;
  const reply = data?.partnerReply as { text?: unknown } | undefined;
  return { active, rating: active ? rating : 0, time: timestamp?.toMillis?.() ?? 0, awaiting: active && !(typeof reply?.text === "string" && reply.text.trim()) ? 1 : 0, withPhotos: active && Array.isArray(data?.photoIds) && data.photoIds.length > 0 ? 1 : 0, topics: active ? patterns.filter(([, regex]) => regex.test(String(data?.text ?? ""))).map(([name]) => name) : [] };
}
export function emptyTotals(): Totals { return { count: 0, ratingSum: 0, awaiting: 0, withPhotos: 0, buckets: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 }, topicCounts: {} }; }
export function applyContribution(raw: Partial<Totals> | undefined, before: Contribution | undefined, after: Contribution): Totals {
  const totals = { ...emptyTotals(), ...raw, buckets: { ...emptyTotals().buckets, ...raw?.buckets }, topicCounts: { ...raw?.topicCounts } };
  for (const [value, direction] of [[before, -1], [after, 1]] as const) {
    if (!value?.active) continue;
    totals.count += direction; totals.ratingSum += direction * value.rating;
    totals.awaiting += direction * value.awaiting; totals.withPhotos += direction * value.withPhotos;
    totals.buckets[String(value.rating)] = (totals.buckets[String(value.rating)] ?? 0) + direction;
    for (const topic of value.topics) totals.topicCounts[topic] = (totals.topicCounts[topic] ?? 0) + direction;
  }
  if ([totals.count, totals.ratingSum, totals.awaiting, totals.withPhotos, ...Object.values(totals.buckets), ...Object.values(totals.topicCounts)].some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error("REVIEW_AGGREGATE_DRIFT");
  return totals;
}
export function summary(totals: Totals) { return { count: totals.count, ratingSum: totals.ratingSum, average: totals.count ? Math.round(totals.ratingSum / totals.count * 10) / 10 : 0, buckets: totals.buckets }; }
export const utcDay = (time: number) => new Date(time).toISOString().slice(0, 10);
export function period(totals: Pick<Totals, "count" | "ratingSum" | "awaiting" | "withPhotos">) { return { average: totals.count ? Math.round(totals.ratingSum / totals.count * 10) / 10 : 0, count: totals.count, awaiting: totals.awaiting, withPhotos: totals.withPhotos }; }
