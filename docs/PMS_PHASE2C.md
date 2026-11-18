# Phase 2C — Connected Today

Today is the owner, manager and receptionist landing workspace. Overview remains permission gated reporting; department workspaces and permissions remain unchanged.

## Queues

Selected-date arrivals and departures include confirmed, checked-in, checked-out and completed reservations. Awaiting check-in includes confirmed arrivals only. Dates use the hotel timezone. An implicit Today selection follows hotel midnight; explicit URL dates remain fixed.

Live in-house includes every checked-in reservation, including overdue departures. Room and balance attention includes checked-in stays and confirmed arrivals through the current hotel day, plus confirmed arrivals on the selected date. Future active guest requests remain actionable under the existing settlement rules. Requests count reservations; a separate count reports individual requests. Overdue arrival/departure uses agreed instants and never changes status.

Room reasons distinguish unassigned, missing/inactive/wrong-type assignment, unknown/dirty housekeeping, maintenance overlap and other current occupancy. Clean and inspected rooms are ready. Combined attention is deduplicated by reservation ID. These are advisory; registration, cleanliness and balance introduce no lifecycle gates.

## Server boundary

GET `/api/partner/today/summary` and `/api/partner/today/reservations` require operational access and reservation.read, including the central route boundary. Reauthorization precedes cache access. Rows exclude contact information, invitation secrets, payment records and media. Financial amounts require payment.read.

A single evaluation supplies predicates for counts and lists. Active candidates are read in 500-record pages, capped at 10,000. Selected-date completed activity is queried separately, also bounded at 10,000 per query. Physical units and active maintenance are bounded at 1,000 each. Exceeding any bound returns an explicit unavailable response, never partial counts. The UI links to existing date-filtered Reservations browsing. The evaluation uses required-field projections; it reads no event/payment histories or media.

The existing Redis cache primitive retains operational evaluations for at most ten seconds, with no stale fallback. Pages default to 20, maximum 50. HMAC cursors bind account, hotel, date, queue and content generation and expire after ten minutes. Changed data expires cursors explicitly; restarting a queue preserves the workspace selection.

## Navigation and refresh

Today, Reservations, Overview, search and permitted room links reuse ReservationWorkspace. URLs retain page context and an allowlisted section. Detail requests include propertyId and reject mismatches before serialization. Hotel changes clear reservation, section and cursor. Opening adds history; closing replaces the selection entry. Draft and busy guards cover links, same-document history and browser navigation; unload retains the native browser warning. Search stays in supported pages and falls back to Today.

Operational queries poll every 30 seconds while visible and refresh on focus/reconnect. Shell authorization remains at 15 seconds. Successful client mutations invalidate property-scoped operational queries; changes in other sessions are observed by polling plus the ten-second cache bound. Retained query data remains visible on refresh failure and is labelled stale. Assignment drafts retain their original revision during background refresh.

## Release and verification

No data migration, backfill, deployment, index publication or production testing is part of this change. Before release, provision the manifest's added bookings indexes: propertyId + bookingStatus + checkIn + document ID ascending, and the corresponding checkOut shape. Existing active-status and maintenance indexes are reused. Configure a production cursor signing secret. Validate indexes in staging; emulator success does not prove cloud index readiness.

Local checks cover queue semantics, real Firestore pagination/authorization and real Next.js desktop/mobile deep-link/back/refresh behavior. Existing PMS and creation/recovery suites provide regression coverage. The full acceptance matrix remains broader than the added browser test: clock-driven hotel midnight, two-session propagation, all notification entry points, evaluation-limit UI, Redis outage/cache expiry and every dirty-navigation race require additional staging/manual verification. Do not interpret the local smoke tests as production validation.

### Recorded local results

- Unit suite: 563 passed; 130 environment-dependent cases skipped in the non-emulator run.
- Today Firestore suite: 2 passed (all queue/count comparisons and cursor/access boundaries).
- PMS emulator regression: 76 passed across 10 files.
- Real Next.js Today browser smoke: desktop and mobile passed.
- Real Next.js Phase 2B creation/recovery browser regression: 6 passed.
- TypeScript, lint (warnings retained), production webpack build, worker builds and whitespace checks passed during implementation.

### Post-review corrections (14 November 2026)

Today uses a hotel-specific Redis generation in addition to existing cache-family generations. Shared operational transactions publish invalidation only after Firestore commits, using scopes from the successful attempt. All date/queue evaluations for that hotel refresh immediately on the next request while other hotels retain their caches. Staff/customer booking, payment, request, registration, assignment, housekeeping, maintenance and relevant refund mutations use this boundary. Cache failures remain best-effort and the existing direct-read fallback/ten-second bound remains in place.

Partner booking notifications now enter Today with hotel and booking selection, avoiding the reporting permission required by Overview. Real browser checks cover receptionists, managers and owners on desktop/mobile.

Post-fix checks: 567 web units passed (133 skipped); 5 cached Today Firestore cases, 76 PMS cases, 32 customer booking/payment cases and 8 Today browser cases passed. TypeScript, worker builds and whitespace checks passed. Lint has no errors and 97 retained warnings. No booking schema migration is required.

Hosted index completion (14 November 2026): the missing bookings departure index (propertyId, bookingStatus, checkOut, document ID ascending) was published additively to helpkey-a8fab and is READY. All 113 required index definitions are present and READY; all 114 pre-existing hosted indexes were preserved (115 total). Both Today arrival/departure query plans validate with analyze:false, without fetching hotel records. Application/worker deployment remains separate.
