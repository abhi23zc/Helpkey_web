import { reservationHandler } from "@/lib/partner/reservations/handler";
import { readSettings, saveSettings } from "@/lib/partner/invoices/service";
type Context = { params: Promise<{ propertyId: string }> };
const path = "/api/partner/properties/[propertyId]/invoice-settings";
export const GET = reservationHandler(path, false, async (_, c: Context, uid) =>
  Response.json(await readSettings(uid, (await c.params).propertyId)),
);
export const POST = reservationHandler(path, true, async (r, c: Context, uid) =>
  Response.json(
    await saveSettings(uid, (await c.params).propertyId, await r.json()),
  ),
);
