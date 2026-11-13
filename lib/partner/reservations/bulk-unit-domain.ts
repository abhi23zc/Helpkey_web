import { z } from "zod";

export const bulkUnitSource = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("range"),
      start: z
        .string()
        .trim()
        .regex(/^\d{1,40}$/),
      end: z
        .string()
        .trim()
        .regex(/^\d{1,40}$/),
    })
    .strict(),
  z.object({ mode: z.literal("list"), text: z.string().max(5000) }).strict(),
]);
export type BulkUnitSource = z.infer<typeof bulkUnitSource>;
export type RegisterUnit = {
  id: string;
  label: string;
  roomTypeId: string;
  status: string;
};
export type BulkUnitPreview = {
  previewId: string;
  proposed: string[];
  newLabels: string[];
  existing: RegisterUnit[];
  duplicates: string[];
  remainingCapacity: number;
  capacityAfter: number;
  canSave: boolean;
};
export function expandUnitLabels(raw: unknown): string[] {
  const source = bulkUnitSource.parse(raw);
  let labels: string[];
  if (source.mode === "range") {
    const start = BigInt(source.start),
      end = BigInt(source.end);
    if (end < start || end - start >= BigInt(100))
      throw new Error("Enter an ascending range of up to 100 room numbers.");
    const width =
      source.start.startsWith("0") || source.end.startsWith("0")
        ? Math.max(source.start.length, source.end.length)
        : 0;
    labels = Array.from({ length: Number(end - start) + 1 }, (_, i) =>
      String(start + BigInt(i)).padStart(width, "0"),
    );
  } else
    labels = source.text
      .split(/[,\r\n]+/)
      .map((v) => v.trim())
      .filter(Boolean);
  if (
    !labels.length ||
    labels.length > 100 ||
    labels.some((v) => v.length > 40)
  )
    throw new Error("Enter 1–100 room numbers, each up to 40 characters.");
  return labels;
}
export const compareRoomLabels = (a: string, b: string) =>
  a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }) ||
  a.localeCompare(b, "en");
export function planUnitLabels(
  labels: string[],
  units: RegisterUnit[],
  roomTypeId: string,
  capacity: number,
) {
  const seen = new Set<string>(),
    duplicates: string[] = [],
    newLabels: string[] = [],
    existing: RegisterUnit[] = [];
  for (const label of labels) {
    const key = label.toLowerCase();
    if (seen.has(key)) {
      duplicates.push(label);
      continue;
    }
    seen.add(key);
    const match = units.find((u) => u.label.toLowerCase() === key);
    if (match) existing.push(match);
    else newLabels.push(label);
  }
  const remainingCapacity =
    capacity -
    units.filter((u) => u.roomTypeId === roomTypeId && u.status === "active")
      .length;
  return {
    proposed: labels,
    newLabels,
    existing,
    duplicates,
    remainingCapacity,
    capacityAfter: remainingCapacity - newLabels.length,
    canSave: newLabels.length > 0 && newLabels.length <= remainingCapacity,
  };
}
