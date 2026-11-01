# Partner reservations

## Working page

`/partner/reservations` defaults to the shell's selected property/timezone and a
seven-day window starting on its selected date. Explicit day/range/all scopes remain
available.
Daily cards show arrivals, departures, checked-in stays, actionable guest requests
and overdue confirmed arrivals (the latter is explicitly current-time/global).
A guest note alone is not a pending service request. Actual no-shows have a separate
view. Upcoming selects all dates from the selected date and excludes past arrivals.

The URL owns scope (`day`, `range`, `all`), date basis (`stay`, `arrival`, `departure`),
`from`, `to`, operation view, booking status, roomTypeId, paymentStatus, bookingMode,
search, signed cursor and selected bookingId. Back/forward restores these values.
Room filters use immutable IDs rather than room names. Search supports a full name
word, full email/phone, reference token or exact booking ID, not arbitrary substrings.
Refresh runs every 60 seconds while visible and on focus/request changes. Empty,
loading and failed requests are distinct. Mobile uses cards; desktop uses a table.

Exports contain all matching results, with formulas neutralized and sensitive guest
information restricted to authorized property members. Files are bounded to 10,000
matches/candidates and fail explicitly above that bound. Filters/counts share the
same predicate. Request/balance predicates and historical overnight-mode fallback
require bounded indexed candidate evaluation; ordinary filters and counts run in
Firestore. Sparse legacy records without stay dates must be reconciled separately.

## Reservation drawer

The drawer shows guest contact actions, booked stay dates, room assignment and the
saved arrival plan first. Online pre-check-in remains separate from front-desk
check-in. Balance/readiness warnings and open guest requests appear before the
payment summary. Request descriptions, deadlines, saved guest inputs, hotel
responses and quote terms expand on demand; preparation actions remain visible.
Payment forms open through an explicit collection, refund or reversal action.
Online/Razorpay bookings hide the manual refund button and selector option;
hotel-collected payments retain the refund action.
Staff notes are secondary expandable controls. Reservation editing is temporarily
unavailable in the drawer. Reservation
activity is not displayed in this drawer; underlying audit events remain intact.

The persistent footer keeps check-in/out and eligible secondary actions available.
Eligibility, advisory room-readiness checks, financial confirmations and feature
flags retain their existing server rules. Drafts survive background refreshes,
including failed refreshes; closing unfinished forms offers keep editing or discard.
Both request message fields say “Message to guest (optional)”: preparation messages
are saved with the preparation update, while agreement messages accompany approval,
quote or decline decisions (a decline explanation remains required). Staff notes
remain private.

## Operational endpoints

- GET/POST `/api/partner/bookings`: filtered list or existing manual booking creation.
- GET `/api/partner/bookings/export`: complete bounded CSV for the same filters.
- GET `/api/partner/bookings/:id/operations`: staff-only activity (50 events with
  `before` cursor), payment receipts, refund records, room register and feature flags.
- POST `.../operations`: `note`, `assign`, `collect`, `reverse`, `refund`.
  Writes require an Idempotency-Key; assignment also requires reservationRevision.
- POST/PATCH `/api/partner/bookings/:id/amendment`: signed five-minute price preview
  and transactional confirmation. Confirmation requires an Idempotency-Key.
- GET/POST `/api/partner/physical-units`: authorized room register/read and save.

The shared reservation workspace retains existing lifecycle and guest-request
services. Staff notes are append-only activity records and never customer booking
fields. Room labels are unique per property, renameable and optional; room type
cannot change after creation. Rooms with active assignments cannot be deactivated.
All assignment changes check overlap including cleaning buffers transactionally.
Cancellation/no-show releases assigned slots. Early checkout retains scheduled
allocation and buffer, consistent with sellable inventory.

Collections are actual property cash/UPI/card-terminal payments. Noncash references
are required. Reversals retain the original receipt and apply only to unused property
collections. Property refunds require an explicit confirmation/reference that money
was returned. Online refunds enqueue the existing provider worker and remain pending
until the provider confirms them. Both are capped by unspent original receipt funds.
Historical totals without an identifiable receipt remain visible but cannot be
silently fabricated into refundable receipts. Supplementary service payments retain
their existing separate agreement and refund workflows.

Amendments support future confirmed `interval_v1` bookings before check-in. They
reprice the complete revised stay against current published rates, terms and taxes,
show outstanding collection/refundable excess, recheck capacity while subtracting
the booking's own existing allocation and atomically replace its hold/calendars.
Same-type assigned rooms are rechecked; a room-type change clears the old physical
assignment. Original quotes and full before/after records remain in staff activity.
Customer serialization and printed receipts use revised saved dates/price. Pending
refunds, existing extras/customization agreements or discounts block amendment with
an explanation; no promised service or discount is silently discarded. In-house
changes, external OTA/calendar sync and additional online payment links are outside
this release. A revised amount due is collected at the property.

## Rollout

Three flags independently gate allocation, financial writes and amendments:
`PARTNER_RESERVATIONS_ALLOCATION`, `PARTNER_RESERVATIONS_PAYMENTS`,
`PARTNER_RESERVATIONS_AMENDMENTS`. Each accepts `true`/`false`; development/test
is enabled by default, production is disabled by default. Existing manual booking
creation remains compatible and newly recorded paid bookings get immutable receipts.

34 additive composite indexes are included for these reservation filters, physical
assignment lookup and dated property-payment reporting (in addition to the prior
8 dashboard indexes). Deploy them without deleting existing indexes and wait for
READY before using the new queries. The 34 additive indexes were deployed to `helpkey-a8fab` and verified READY.
No web-hosting deployment or historical data rewrite was performed. Existing room types and bookings do
not receive automatically generated physical rooms. No inventory-engine migration
is included. Rebuild/redeploy the booking worker for the shared booking-service
changes. Enable the three features only after the emulator and browser checks pass.
Monitor existing API request logs for INDEX_NOT_READY, NARROW_DATE_RANGE and conflict
responses, and existing refund worker retries/attention records for provider failures.

## Validation

- `npx vitest run tests/partner-reservations.test.ts`
- `FIRESTORE_EMULATOR_HOST=127.0.0.1:8094 npx vitest run tests/partner-reservations.emulator.test.ts`
  (only a localhost emulator is accepted; never production credentials)
- `npm run test:e2e:partner` covers the real components against isolated HTTP fixtures.
- Run existing booking/stay transaction emulator tests, the complete unit suite,
  TypeScript, ESLint and the production build after shared service changes.

Validated: 307 unit tests, 51 transaction checks across the four isolated Firestore
suites (13 reservation, 19 booking, 17 stay, 2 dashboard), responsive browser checks,
TypeScript, ESLint, production webpack build and worker bundle build. Online refund
provider calls are mocked in regression tests; no live payment was made.
