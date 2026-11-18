# Phase 2C review — 14 November 2026

Phase 2C adds bounded hotel-local Today queues, shared reservation links, server eligibility metadata and property-scoped browser refresh. Two reproduced integration issues should be corrected before Phase 2D.

## Findings (resolved)

### [P2] Invalidate Today on the server after successful mutations

`lib/partner/today/service.ts:34` caches each hotel's evaluation for ten seconds. `lib/partner/operational-queries.ts` invalidates only React Query; existing search/property invalidations do not change the partner-today Redis generation. A successful collection, assignment or lifecycle action can therefore immediately refetch the previous counts, balances and readiness. Manual refresh cannot bypass a still-fresh server cache. With 30-second polling, old data may remain displayed until the next poll after the cache expires.

Reproduced with real disposable Firestore records and an in-memory Redis test double exercising the actual cache primitive: warm Today with 23 unpaid reservations, collect the remaining 900 paise on one booking through performOperation, verify paidPaise became 1000 in Firestore, then call loadToday again. It returns the previous evaluation and still counts 23 unpaid stays instead of 22. Existing Today emulator/browser tests disable the server cache and do not cover this.

Add property-scoped server invalidation after successful operational mutations and regression coverage with caching enabled. Preserve authorization-before-cache and avoid invalidating every hotel's cache globally.

### [P2] Route receptionist notifications to a permitted reservation workspace

`components/shared/notification-bell.tsx:84` still routes booking notifications to /partner/dashboard. That route requires reports.read; receptionists have reservation.read but not reports.read. The new Today landing route supports their workspace, but the notification bypasses it.

Reproduced with a real receptionist account, permitted hotel, reservation and booking notification: clicking the notification opens Overview's permission-denied notice and no reservation workspace. Link to a permitted shared-workspace entry, preserve hotel/booking context, and test notification navigation for receptionists as well as owners/managers.

## Verification

- Full web unit suite: 563 passed; 130 environment-dependent tests skipped.
- TypeScript passed. Full ESLint reported zero errors and 97 warnings.
- Today Firestore queue/access/cursor checks: 2 passed.
- Existing PMS domain/emulator regression suite: 76 passed.
- Real desktop/mobile Today direct-link/back/refresh tests: 2 passed.
- Real desktop/mobile Phase 2B creation/advance/recovery regressions: 6 passed.
- Additional cache and notification probes reproduced both findings; temporary probe source/config files were removed.

No product source changes, deployment, index publication or live hotel data mutation were performed. Verification used isolated local emulator hotels. The implementation documentation also leaves clock-driven midnight, complete two-session propagation, Redis outage, bounds UI and dirty-navigation race acceptance coverage outstanding; this review does not certify those paths as production-tested.

## Next milestone

Resolve these Phase 2C integration gaps before Phase 2D. Phase 2D should define and enforce hotel-specific check-in/readiness/registration and checkout/balance policies at authoritative server commands, expose precise permitted-action/blocker reasons, retain explicit authorized overrides with history where approved, and verify concurrent staff/customer flows. Do not introduce new policies silently or expand into folios, tax invoices, extensions/moves, night audit or channels.

## Resolution — 14 November 2026

- Shared hotel-scoped post-commit invalidation now covers booking creation/lifecycle, collections and reversals, assignment/amendments, housekeeping/maintenance, guest registration, customer request/payment changes and background refunds. Each Firestore attempt collects its own affected hotel scopes; only the successful commit advances Redis generations. Rejected mutations do not invalidate, other hotels remain cached, and Redis unavailability does not turn a successful commit into a failed mutation response. No extra Firestore lookups or persisted fields were introduced.
- Booking notifications now open the shared reservation workspace through Today. Receptionists, managers and owners were verified on both desktop and mobile. Existing hotel authorization remains in force.
- Four cache unit checks pass, including scope isolation across dates/hotels, rejected writes, transaction retry isolation and cache unavailability. Five real Firestore Today checks pass with the actual cache primitive enabled using an in-memory Redis test double, including immediate collection, housekeeping and lifecycle refresh.
- Full web units: 567 passed, 133 environment-dependent cases skipped. Existing PMS checks: 76 passed; separate customer booking/payment regressions: 32 passed. All eight Today desktop/mobile browser checks pass. TypeScript, worker bundles and whitespace checks pass; lint has zero errors and 97 existing warnings.

The application and workers still need the normal release process. No production booking records were modified during verification. The broader clock-driven/two-session acceptance scenarios documented by the implementation remain outside these focused corrections.

Hosted index completion (14 November 2026): the missing bookings departure index (propertyId, bookingStatus, checkOut, document ID ascending) was published additively to helpkey-a8fab and is READY. All 113 required index definitions are present and READY; all 114 pre-existing hosted indexes were preserved (115 total). Both Today arrival/departure query plans validate with analyze:false, without fetching hotel records. Application/worker deployment remains separate.
