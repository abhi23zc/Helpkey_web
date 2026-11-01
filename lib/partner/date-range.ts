import { validDate } from "@/lib/booking/domain";
export const shiftDay = (day: string, offset: number) =>
  new Date(Date.parse(`${day}T12:00Z`) + offset * 86400000)
    .toISOString()
    .slice(0, 10);
export function validPageRange(from?: string | null, to?: string | null) {
  return (
    !!from &&
    !!to &&
    validDate(from) &&
    validDate(to) &&
    from <= to &&
    (Date.parse(to) - Date.parse(from)) / 86400000 < 31
  );
}
export function pageRange(
  from: string | null,
  to: string | null,
  anchor: string,
  before = 0,
  after = 0,
) {
  return validPageRange(from, to)
    ? { from: from!, to: to! }
    : { from: shiftDay(anchor, -before), to: shiftDay(anchor, after) };
}
export function rangeDays(from: string, to: string) {
  if (!validPageRange(from, to)) throw new Error("INVALID_DATE_RANGE");
  return Array.from(
    { length: Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1 },
    (_, i) => shiftDay(from, i),
  );
}
