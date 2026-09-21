import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const cursorPayload = z.object({ values: z.array(z.union([z.string(), z.number(), z.null()])), id: z.string().min(1) }).strict();
export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(25),
  cursor: z.string().max(2_048).optional(),
}).strict();

const secret = () => process.env.CURSOR_SIGNING_SECRET ?? process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? "helpkey-development-cursor-secret";

export type CursorPayload = z.infer<typeof cursorPayload>;

export function encodeCursor(payload: CursorPayload) {
  const data = Buffer.from(JSON.stringify(cursorPayload.parse(payload))).toString("base64url");
  const signature = createHmac("sha256", secret()).update(data).digest("base64url");
  return `${data}.${signature}`;
}

export function decodeCursor(cursor: string): CursorPayload {
  const [data, signature, extra] = cursor.split(".");
  if (!data || !signature || extra) throw new Error("INVALID_CURSOR");
  const expected = createHmac("sha256", secret()).update(data).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new Error("INVALID_CURSOR");
  return cursorPayload.parse(JSON.parse(Buffer.from(data, "base64url").toString("utf8")));
}
