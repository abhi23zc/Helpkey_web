import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, listQuerySchema } from "@/lib/api/pagination";

describe("opaque pagination cursors", () => {
  it("round trips stable values and document id", () => { const encoded = encodeCursor({ values: [1720000000000, "active"], id: "doc-42" }); expect(decodeCursor(encoded)).toEqual({ values: [1720000000000, "active"], id: "doc-42" }); });
  it("rejects tampering", () => { const encoded = encodeCursor({ values: [1], id: "a" }); expect(() => decodeCursor(`${encoded}x`)).toThrow("INVALID_CURSOR"); });
  it("enforces the global page maximum", () => { expect(() => listQuerySchema.parse({ limit: 51 })).toThrow(); expect(listQuerySchema.parse({}).limit).toBe(25); });
});
