import { describe, expect, it } from "vitest";
import { acceptOffer, publishOffer } from "../lib/stay/offer-domain";
import type { StayRequest } from "../lib/stay/contracts";
const now = Date.parse("2026-11-11T10:00:00Z");
const item = (id: string, amountPaise: number) => ({ id, status: "requested", settlement: "awaiting_customer", quote: { version: 1, amountPaise, scope: id, status: "offered", expiresAt: "2026-11-12T10:00:00Z" } }) as StayRequest;
describe("combined extras offers", () => {
  it("collects cake and aroma in a single server-priced offer", () => {
    const o = publishOffer("offer",1,["cake","aroma"],[item("cake",50000),item("aroma",70000)],now);
    expect(acceptOffer(o,1,["cake","aroma"],now).amountPaise).toBe(120000);
    const selected = acceptOffer(o,1,["aroma"],now);
    expect(selected.amountPaise).toBe(70000);
    expect(selected.declinedRequestIds).toEqual(["cake"]);
  });
  it("requires all requests to be reviewed", () => {
    expect(() => publishOffer("offer",1,["cake","aroma"],[item("cake",50000), { id: "aroma", status: "requested" } as StayRequest],now)).toThrow(/Review every/);
  });
  it("allows free approvals without adding a charge", () => {
    const o = publishOffer("offer",1,["cake","pillow"],[item("cake",50000),{ id: "pillow", status: "confirmed", settlement: "included", totalPaise: 0 } as StayRequest],now);
    expect(o.items).toHaveLength(1);
    expect(acceptOffer(o,1,[],now).offer.status).toBe("declined");
  });
  it("rejects stale, expired, duplicated and unknown selections", () => {
    const o = publishOffer("offer",1,["cake"],[item("cake",50000)],now);
    expect(() => acceptOffer(o,2,["cake"],now)).toThrow();
    expect(() => acceptOffer(o,1,["cake"],Date.parse(o.expiresAt))).toThrow();
    expect(() => acceptOffer(o,1,["cake","cake"],now)).toThrow();
    expect(() => acceptOffer(o,1,["other"],now)).toThrow();
    expect(() => acceptOffer({ ...o,status: "accepted" },1,["cake"],now)).toThrow();
  });
});
