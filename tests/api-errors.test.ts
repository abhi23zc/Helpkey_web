import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiException, toApiException } from "@/lib/api/errors";

describe("API errors", () => {
  it("preserves known domain errors", () => { const error = new ApiException("FORBIDDEN", 403); expect(toApiException(error)).toBe(error); });
  it("maps validation failures without leaking input", () => { const result = z.object({ value: z.string() }).safeParse({ value: 2 }); expect(result.success).toBe(false); if (!result.success) expect(toApiException(result.error).code).toBe("VALIDATION_ERROR"); });
  it("maps infrastructure failures to 500", () => { expect(toApiException(new Error("database credentials"))).toMatchObject({ code: "INTERNAL_ERROR", status: 500 }); });
});
