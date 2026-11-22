import { describe, expect, it } from "vitest";
import { stayFinancials } from "@/lib/stay/domain";
import { supplementalFinancials } from "@/lib/stay/agreements";
import { hotelCollectionTotal } from "@/lib/stay/hotel-collections";
import type { StayRequest } from "@/lib/stay/contracts";

const service = { id: "breakfast", settlement: "hotel_collection", status: "confirmed",
  quote: { status: "accepted", amountPaise: 55000 } } as StayRequest;
describe("hotel-collected service charges", () => {
  it("uses hotel receipts and restores balances after reversals or refunds", () => {
    const booking = { totalPaise: 220000, paidPaise: 220000, customizations: [service] };
    expect(stayFinancials(booking)).toMatchObject({ effectiveTotalPaise: 275000, balanceDuePaise: 55000 });
    expect(stayFinancials({ ...booking, paidPaise: 247500 }).balanceDuePaise).toBe(27500);
    expect(stayFinancials({ ...booking, paidPaise: 275000 }).balanceDuePaise).toBe(0);
    expect(stayFinancials({ ...booking, paidPaise: 275000, refundedPaise: 55000 }).balanceDuePaise).toBe(55000);
    expect(stayFinancials({ ...booking, customizations: [{ ...service, status: "declined" }] }).balanceDuePaise).toBe(0);
  });
  it("counts neither unaccepted services nor malformed optional request data", () => {
    expect(hotelCollectionTotal([{ ...service, quote: { ...service.quote!, status: "offered" } }])).toBe(0);
    expect(hotelCollectionTotal([null, "bad"] as unknown as StayRequest[])).toBe(0);
    expect(hotelCollectionTotal("bad" as unknown as StayRequest[])).toBe(0);
  });
  it("does not double count hotel charges alongside online service receipts", () => {
    const online = { ...service, id: "online", settlement: "paid", quote: { ...service.quote!, amountPaise: 10000, paymentId: "pay", paymentStatus: "paid" } } as StayRequest;
    const summary = supplementalFinancials([service, online], [{ requestId: "online", quoteVersion: 1, paymentId: "pay", orderId: "order", scope: "Online service", amountPaise: 10000, status: "paid" }]);
    expect(summary).toMatchObject({ totalPaise: 10000, paidPaise: 10000 });
    expect(hotelCollectionTotal([service, online])).toBe(55000);
  });
});
