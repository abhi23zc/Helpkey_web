# Partner room workspace

Room types retain existing creation, details, amenities, photo moderation, base rates and inventory settings. Availability & rates adds a 7-day calendar, bounded date-range price/stop-sell edits with a server preview, exact interval capacity checks, and maintenance. Housekeeping reuses the physical-unit register and tracks unknown/dirty/clean/inspected separately from occupancy.

## Pricing and availability

Overnight quotes sum each stay date's override or base price. Hourly quotes use a complete duration table for the arrival date, including stays across midnight. Shared rules feed search, checkout, manual bookings and reservation amendments. Existing bookings retain their snapshots. Availability always includes existing holds, maintenance and cleaning buffers. A daily minimum is labelled capacity; it is not an exact-stay booking offer.

Calendar reads are limited to 31 days and 100 room/rate types. Bulk operations accept up to 100 unique cells, past dates cannot be edited, and future edits are limited to one year. Previews expire after five minutes and fail if source documents changed. Applying the same preview again is safe. Maintenance spans at most the booking engine's 32-day interval limit; longer work is scheduled in explicit intervals. Maintenance refuses overcommitted capacity and numbered-room assignment conflicts.

## Housekeeping

No physical room numbers or clean statuses are backfilled. Register room numbers explicitly; registration does not increase configured capacity. Checkout marks the assigned unit dirty. Partner check-in shows readiness warnings but does not require a clean room. Existing conflict checks still prevent overlapping assignments. Unit maintenance blocks both assignment and aggregate inventory. Release is idempotent. The latest 30 cleaning events can be viewed in the cleaning editor.

Room type archive preserves historical records and refuses pending/confirmed/in-house reservations; pause remains available. Room numbers with active maintenance cannot be deactivated.

## Enablement

`PARTNER_ROOMS_CALENDAR` and `PARTNER_ROOMS_HOUSEKEEPING` default on outside production and off in production. Set each to `true` to enable the respective workflow. Physical room registration/assignment also uses the existing `PARTNER_RESERVATIONS_ALLOCATION` flag. Existing saved date prices remain authoritative when calendar editing is disabled.

No inventory engine is migrated. Legacy properties retain nightly capacity reads and base/date pricing; interval maintenance, exact capacity checks and stop-sell controls explain the setup requirement. No hosting deployment or live booking edits are part of this implementation.

Optional operational cleanup: configure Firestore TTL for `roomBulkPreviews.expiresAt`. Authentication and explicit preview expiry checks remain mandatory without TTL.

## Verification

Run unit tests, the partner-room emulator suite with a localhost Firestore emulator, and the partner browser suite. Browser fixtures use isolated mocked HTTP responses and do not mutate live hotel data.

## Shared partner date picker

Dashboard reporting defaults to seven days ending on the selected date; reservations default to seven days starting on the selected date. Explicit custom ranges remain available. Rooms use `calendarStart` and `calendarEnd` in the URL (inclusive, maximum 31 days), defaulting to 7 days. The selected calendar range also pre-fills bulk edits. React DayPicker displays two months on desktop and one on mobile, with draft selection, Today, Cancel, Apply, keyboard navigation, Escape, and focus restoration. Calendar dates are date-only values; the Today shortcut uses the property timezone where supplied, otherwise Asia/Kolkata.
