import { localParts } from "@/lib/booking/domain";
import { staySearchFromParams, type StaySearch } from "@/lib/customer/stay-search";

/** Retain incomplete inputs for editing without sending invalid requests. */
export function hotelStayDraft(params: URLSearchParams): StaySearch {
  return staySearchFromParams(params) ?? {
    bookingMode: params.get("bookingMode") === "hourly" ? "hourly" : "overnight",
    checkIn: params.get("checkIn") || undefined,
    checkOut: params.get("checkOut") || undefined,
    arrivalTime: params.get("arrivalTime") || undefined,
    durationMinutes: params.has("durationMinutes") ? Number(params.get("durationMinutes")) : undefined,
    adults: Number(params.get("adults") ?? 2),
    children: Number(params.get("children") ?? 0),
    infants: Number(params.get("infants") ?? 0),
  };
}
export function nextHotelMode(current: StaySearch, mode: "overnight" | "hourly", remembered: Partial<StaySearch>, timezone: string, now = Date.now()): StaySearch {
  const today = localParts(now, timezone).date;
  const nextDay = (date: string) => new Date(Date.parse(`${date}T00:00Z`) + 86400_000).toISOString().slice(0, 10);
  const checkIn = current.checkIn || nextDay(today);
  const common = { bookingMode: mode, checkIn, adults: current.adults, children: current.children, infants: current.infants };
  if (mode === "overnight") {
    const checkOut = remembered.checkOut && remembered.checkOut > checkIn ? remembered.checkOut : nextDay(checkIn);
    return { ...common, checkOut };
  }
  const localTime = localParts(now, timezone).time;
  let arrivalTime = remembered.arrivalTime ?? "10:00";
  if (checkIn === today && arrivalTime <= localTime) {
    const minutes = Number(localTime.slice(0, 2)) * 60 + Number(localTime.slice(3, 5));
    const next = (Math.floor(minutes / 15) + 1) * 15;
    // An empty value is deliberately invalid when no arrival slots remain.
    arrivalTime = next < 1440 ? `${String(Math.floor(next / 60)).padStart(2, "0")}:${String(next % 60).padStart(2, "0")}` : "";
  }
  return { ...common, arrivalTime, durationMinutes: remembered.durationMinutes ?? 180 };
}
