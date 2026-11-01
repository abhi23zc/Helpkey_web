# Partner overview

`/partner/dashboard` is the daily operations and reporting workspace for Helpkey and manually entered bookings. It retains property/date/range/view/booking context in the URL and revalidates every 60 seconds while visible, on focus, on mount and after reservation actions.

## Behavior and definitions

- Arrivals/departures include selected-day eligible reservations, split into expected and completed. Hourly stays use actual local start/end times. Checked-in stays are separate from booked room-time utilization.
- Utilization is the shared booking engine's overlapping room-hours divided by current active room capacity × hours in the reporting window. Historic room-capacity changes are not reconstructed; blocked inventory is reported separately. This is booked utilization, not physical room occupancy.
- Overdue arrivals/checkouts use current time, even in a historical/future selected-date view. They are warnings, never automatic status transitions. The existing booking state machine enforces eligibility for actions.
- Request work includes requested services and confirmed/preparing/ready services awaiting completion, scoped to active selected-day stays. General notes do not create permanent task counts.
- Booked sales are current valid saved booking values (less customization credits), grouped by booking creation date; they are not accrual revenue. Original checkout extras are already in the booking snapshot. Separately captured service payments are shown in collections/service breakdown, not added to the original booking snapshot.
- Collections use unique verified `paymentAttempts` identities, including captures awaiting refund, by recorded capture-processing timestamp. Property collections require an actual recorded manual booking payment. Legacy booking `paidAt` is a fallback only when no original provider attempt is present. Successful refunds use `processedAt`; pending/failed refunds never reduce collections. Net collections may be negative. These figures do not represent commissions or owner payouts.
- Legacy captures with neither property identity nor discoverable booking payment timing cannot be reliably reconstructed by these bounded queries. The UI discloses historical coverage limits rather than inventing dates. No backfill is run automatically.
- Seven daily, eight weekly and twelve monthly buckets end at the selected date; the last week/month is partial. Listing completeness counts real details/location, active rooms, active eligible rates with policies, approved photos and KYC. Publication additionally requires active + approved + explicitly bookable.
- Daily availability is minimum available capacity over the day, including reserved holds, blocks and stop-sell. The room editor remains authoritative for exact arrival/duration decisions. Peak held/booked and peak blocked figures may occur at different times and must not be added independently to calculate remaining capacity.

## Interfaces and compatibility

- Existing `GET /api/partner/dashboard/overview` retains metrics/series/availability/review/alerts/upcomingReservations and adds timezone, generatedAt, period, warnings, readiness, operations and financial breakdowns. Old field names are retained where consumed.
- New owner-authorized `GET /api/partner/bookings/[bookingId]` returns the existing serialized reservation DTO. The overview drawer uses existing strict mutation endpoints and guest-request workflows, including their audit history and printable receipt.
- New owner-authorized `GET /api/partner/bookings/search?propertyId=...&q=...` searches existing exact normalized search tokens, confirmation codes and exact booking IDs. It returns at most eight minimal summaries. It does not claim arbitrary substring matching; no guest contact/identity data is returned by search.
- Reservation list GET additionally accepts `view` and `date` for dashboard operation filters. No booking/payment/refund state semantics are changed.
- New original payment receipts add `propertyId`, matching supplemental receipts. This additive reporting metadata does not change provider behavior or payment identities. Old receipts are read through booking identity queries where discoverable. No new collection or live migration is introduced.
- Sidebar links retain property/date context; notifications with property/booking IDs open the appropriate overview drawer. Missing images use neutral property/initial placeholders. Missing portal modules remain disabled.

## Verification and rollout

1. Deploy the additive indexes in `firestore.indexes.json` and wait for them to finish building before deploying the querying web version. No indexes or production data were deployed as part of implementation.
2. Deploy web. Rebuild/restart workers when deploying this working tree because its pre-existing stay-payment changes share booking services. Do not mix incompatible web/worker versions.
3. Inspect real property-local dates, room inventory, same-day hourly stays, manual payments, late capture/refund records and historical coverage on a canary property. Observe overview/API errors, request duration and Firestore operation counts. No fallback full-history scan runs when an index is missing; the overview returns a retryable unavailable state.
4. Roll back web if necessary; indexes and additive property identity on receipts are compatible with earlier readers.

Commands:

- `npm test`
- `npm run typecheck -- --incremental false`
- `npm run lint`
- `npm run test:e2e:partner` (real components, isolated mocked HTTP boundaries, no live provider calls)
- `FIRESTORE_EMULATOR_HOST=127.0.0.1:8094 npm run test:partner:emulator` (isolated `demo-helpkey-bookings` only; local host required)
- `npm run build -- --webpack`
- `npm run build:workers`

Browser verification covers 390/768/1366px, hourly reservation selection, status confirmation, range switching, property search/switching and unavailable-state recovery. Emulator checks cover >page-size totals, legacy original receipt deduplication, supplemental capture, refunds, stop-sell and ownership. Provider charging, live storage, production indexes and production notification delivery are not exercised.

### Verified in this workspace (31 October 2026)

- Unit/API suite: **301 passed**, **59 skipped** without integration environments.
- Separate isolated Firestore run: **38 passed** across dashboard, booking and stay transactions; provider responses mocked.
- Dashboard browser suite: **6 passed**, including mobile/tablet/desktop, operation actions, search, history, polling and onboarding.
- TypeScript passed; repository ESLint completed with **0 errors and 69 existing warnings**. Worker compilation passed.
- Production webpack build passed. Live provider calls, index deployment and production data changes were not performed.

## Page-owned date ranges

The workspace header no longer contains a date picker. Dashboard, Reservations and Rooms own their respective inclusive date ranges (1–31 days), using the shared React DayPicker control. Dashboard defaults to the last seven days and passes `from`/`to` to the overview API. Financial grouping does not change bounds. Arrival/departure/operations counts deduplicate bookings across the selected days; utilization clips booked room hours to that period. Overdue alerts, review tasks and listing tasks are current and labelled accordingly. Dashboard drill-down links preserve the applicable range.

Reservations defaults to its selected day, retains All dates, and applies custom ranges to lists, operational metrics, tab counts and export. Search and other row filters continue to leave the operational summary independent of search. Rooms keeps its range picker above all three sections; cleaning/occupancy status remains current. Legacy `date` and Rooms `calendarStart`/`calendarEnd` links remain accepted. Removing the visual header date control does not remove internal date context used by existing search/navigation interfaces.

## Reporting clarity and current attention

The dashboard treats `from`/`to` as its reporting range and keeps the legacy `date` parameter synchronized to the final selected day. Applying dates, browser history and navigation to Reservations/Rooms preserve those bounds. A daily availability link opens exactly that day. Dates use the property's timezone; the chart's date-only axis labels use UTC formatting to avoid timezone shifts.

Chart grouping defaults to Auto: daily for 1–14 inclusive days, weekly for 15–31 days. Explicit Daily/Weekly/Monthly choices remain supported by the existing API. Grouping changes bucket granularity, never reporting bounds. All-zero financial series show an explanatory empty state and a property-local last-seven-days action; the table remains available. Refund-only activity remains a real chart, including negative net collections in the table. Sparse complete date labels, currency grid lines and keyboard/pointer/touch bucket details replace cramped truncated labels.

Financial labels consistently distinguish Booking value, Payments received, Refunds issued and Net collections (payments minus completed refunds). Room utilization remains booked room-hours divided by configured capacity-hours; it does not claim physical occupancy. Metric descriptions wrap, with accessible explanations and loading placeholders.

The overview response adds `attention`: `asOf`, `today`, `uniqueReservationCount`, `overdueArrivals`, `overdueDepartures`, `requestStays` and matching `operations` rows. These use the server's current property-local date, independently of reporting dates. Request alerts cover active stays overlapping today with hotel-actionable requests; requests awaiting customer agreement/payment are excluded. The same actionable predicate is used by Reservations so links and counts agree. Reservations are deduplicated across categories for the headline count; category counts can overlap. Review/listing/selected-period availability notices remain separate from live operational work. Existing reporting fields are retained.

The existing active-booking query now anchors to today, not a future report anchor. No new Firestore query shape, index or data migration is introduced. Refresh failures retain matching-period cached data with an explicit last-successful-update warning; initial failures never render zero totals or a no-activity message. Range changes use distinct cache keys, abortable requests and skeletons until the matching response arrives.


Financial chart details use a floating tooltip and a neutral vertical guide.
Pointer details clear on leaving the chart; touch details dismiss with an outside
tap, and Escape dismisses either interaction. A single Tab stop and arrow/Home/End
navigation expose dates and amounts to keyboard users. Empty dates report “No
financial activity”; single-day labels do not repeat the date. The permanent
below-chart detail panel and gold selection outline are removed. Tooltip positions
stay inside the plot container on mobile and desktop, and the table remains
available for inspecting the full series.
