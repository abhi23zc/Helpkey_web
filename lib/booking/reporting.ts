import { canonicalStatus, localParts, resolveLocal } from "./domain";
type Row = { bookingStatus: string; bookingMode?: string; checkIn: string; checkOut: string; startAt?: string; endAt?: string; specialRequest?: string; roomType?: { name?: string } };
export function reservationSummary(rows: Row[], timezone: string, now = Date.now()) {
  const today = localParts(now, timezone).date;
  const active = (row: Row) => ["pending_payment", "confirmed", "checked_in"].includes(row.bookingStatus);
  const arrival = (row: Row) => row.checkIn === today && ["confirmed", "checked_in"].includes(row.bookingStatus);
  const noShow = (row: Row) => row.bookingStatus === "confirmed" && (row.startAt ? Date.parse(row.startAt) < now : row.checkIn < today);
  const matchesView = (row: Row, view: string) => view === "all" || (view === "arrivals" ? arrival(row) : view === "in_house" ? row.bookingStatus === "checked_in" : view === "upcoming" ? active(row) && (row.startAt ? Date.parse(row.startAt) > now : row.checkIn > today) : view === "cancelled" ? ["cancelled", "expired", "payment_failed"].includes(row.bookingStatus) : view === "no_show" ? row.bookingStatus === "no_show" || noShow(row) : canonicalStatus(row.bookingStatus) === canonicalStatus(view));
  const tabs = ["all", "arrivals", "in_house", "upcoming", "pending_payment", "cancelled", "no_show"];
  return {
    today, matchesView,
    tabCounts: Object.fromEntries(tabs.map((tab) => [tab, rows.filter((row) => matchesView(row, tab)).length])),
    metrics: { arrivals: rows.filter(arrival).length, departures: rows.filter((row) => row.checkOut === today && ["checked_in", "checked_out", "completed"].includes(row.bookingStatus)).length, staying: rows.filter((row) => row.bookingStatus === "checked_in").length, pendingRequests: rows.filter((row) => active(row) && row.specialRequest).length, noShowRisk: rows.filter(noShow).length },
    roomNames: [...new Set(rows.map((row) => row.roomType?.name).filter(Boolean))].sort(),
  };
}
export function intervalReport(rows: Row[], startDate: string, endDateExclusive: string, timezone: string, capacity: number) {
  const start = resolveLocal(startDate, "00:00", timezone), end = resolveLocal(endDateExclusive, "00:00", timezone);
  let roomHours = 0, roomNights = 0;
  for (const row of rows) {
    if (!["confirmed", "checked_in", "checked_out", "completed"].includes(row.bookingStatus)) continue;
    const arrival = row.startAt ? Date.parse(row.startAt) : resolveLocal(row.checkIn, "14:00", timezone);
    const departure = row.endAt ? Date.parse(row.endAt) : resolveLocal(row.checkOut, "11:00", timezone);
    roomHours += Math.max(0, Math.min(end, departure) - Math.max(start, arrival)) / 3600000;
    if ((row.bookingMode ?? "overnight") === "overnight") {
      const first = row.checkIn > startDate ? row.checkIn : startDate, last = row.checkOut < endDateExclusive ? row.checkOut : endDateExclusive;
      roomNights += Math.max(0, (Date.parse(`${last}T00:00Z`) - Date.parse(`${first}T00:00Z`)) / 86400000);
    }
  }
  const availableRoomHours = Math.max(0, capacity) * (end - start) / 3600000;
  return { roomHours, roomNights, availableRoomHours, occupancy: availableRoomHours ? Math.min(100, Math.round(roomHours / availableRoomHours * 100)) : 0 };
}
