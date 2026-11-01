import "server-only";
import { createHash } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";
import { validDate, type StayRequest } from "./domain";
export const datePriceId = (propertyId: string, rateId: string, date: string) =>
  createHash("sha256")
    .update(`${propertyId}\0${rateId}\0${date}`)
    .digest("hex");
export const datePriceRef = (
  propertyId: string,
  rateId: string,
  date: string,
) =>
  adminDb
    .collection("rateDatePrices")
    .doc(datePriceId(propertyId, rateId, date));
export function priceDates(
  input: Pick<StayRequest, "checkIn" | "checkOut" | "bookingMode">,
) {
  if (!validDate(input.checkIn)) throw new Error("INVALID_LOCAL_TIME");
  if (input.bookingMode === "hourly") return [input.checkIn];
  if (!input.checkOut || !validDate(input.checkOut))
    throw new Error("INVALID_LOCAL_TIME");
  const count =
    (Date.parse(input.checkOut) - Date.parse(input.checkIn)) / 86400000;
  if (count < 1 || count > 30) throw new Error("STAY_LENGTH_NOT_ALLOWED");
  return Array.from({ length: count }, (_, i) =>
    new Date(Date.parse(input.checkIn) + i * 86400000)
      .toISOString()
      .slice(0, 10),
  );
}
export async function withDatePrices<T extends Record<string, unknown>>(
  propertyId: string,
  rateId: string,
  rate: T,
  input: Pick<StayRequest, "checkIn" | "checkOut" | "bookingMode">,
  tx?: FirebaseFirestore.Transaction,
) {
  if (!rate.datePricingEnabled) return { ...rate, datePrices: {} };
  const dates = priceDates(input),
    refs = dates.map((date) => datePriceRef(propertyId, rateId, date));
  const docs = tx ? await tx.getAll(...refs) : await adminDb.getAll(...refs);
  return {
    ...rate,
    datePrices: Object.fromEntries(
      docs.flatMap((doc, i) => (doc.exists ? [[dates[i], doc.data()!]] : [])),
    ),
  };
}
