# Phase 2B: front-desk creation, advances and room selection

## Reception workflow

Open **Partner → Reservations → New reservation**. The existing Overview entry opens the same form. The selected hotel and timezone appear in the header.

1. Choose **Guest arriving now** or **Future reservation**, then overnight/hourly where the hotel supports it. Walk-ins retain Phase 2A's current hotel-date rule and explicit actual arrival time. Future overnight defaults to today before standard check-in, otherwise tomorrow; hourly defaults to the next quarter-hour at least 30 minutes ahead. Singleton active room types and eligible rates are selected automatically. These are suggestions; the server still enforces the hotel's policies and prices.
2. Review the room type and published rate. Optionally select a physical room, or leave it unassigned. Availability covers the complete stay **and turnover**, not just the arrival date. Rooms display their number, cleaning status, current occupancy and availability. Unavailable choices have explanations. Ready choices are listed first within the loaded results; **Load more rooms** handles large registers. Refresh availability to see changes by other staff; saving always revalidates.
3. Enter the actual lead staying guest, named accompanying guests, and an optional separate booking contact. Missing accompanying names remain explicitly incomplete registration. Phase 2A guest identity, hotel-scoped profiles and verified customer invitation linking are unchanged.
4. Choose **No payment collected**, **Partial advance collected**, or **Full amount collected**. Collection is money staff report receiving at the hotel, not a new online payment. Partial entries accept rupees with at most two decimal places and convert exactly to integer paise. UPI and card-terminal collections require a reference. Authorized price negotiations retain a reason and server-recalculated taxes.
5. Review hotel-local arrival/departure, total, collected and remaining amounts in the persistent footer. Save creates a **confirmed reservation**, optionally assigned and partially/fully collected. **Check in remains a separate explicit action** in the saved reservation workspace.

Dirty/unknown rooms that are otherwise available can be assigned with a warning; they are not presented as ready. This does not add a check-in override or change the existing check-in readiness policy. Current cleanliness on a future booking is advisory and cannot guarantee readiness on its arrival date. Walk-in choices also reject rooms with a currently checked-in guest, including an overdue guest whose scheduled allocation has ended.

Failed validation or conflicts retain input and the selected room. Nothing silently substitutes a different room. Closing a dirty form warns before discarding it; unloading the page also warns. An ambiguous submission (network interruption, incomplete response or server error) freezes the exact request and idempotency key and offers **Retry same reservation**. Do not start a second reservation to recover a lost response. Form drafts are in memory, not browser persistent storage; intentionally leaving or switching accounts discards private input.

## Permissions and operational controls

Existing role presets are preserved. Receptionists can create and assign, but cannot collect. Owners/managers can record an initial collection; cashiers use the existing cashier workflow afterward. Collection requires `payment.collect`; assignment requires `reservation.assign`, in addition to creation permission and hotel operational access. The UI explains unavailable capabilities; both the route and transaction independently enforce authorization. Revocation, PMS activation, administrative restrictions and the marketplace/PMS separation remain authoritative.

Collection and assignment are available to every hotel by default; no deployment environment switches are required and legacy flag values are ignored. They do not activate any hotel's PMS or grant a staff permission. Leaving a reservation unassigned/unpaid remains supported. No role preset or hotel setting is changed automatically.

## Atomic data and compatibility

`POST /api/partner/bookings` adds optional `initialCollectionPaise` and `physicalUnitId`. If the amount is absent, old clients retain their existing full-collection (`paymentMethod: paid`) or zero-collection behavior. An explicit integer amount is authoritative. Negative, fractional, unsafe or above-total paise fail. A positive collection requires permission, enabled payments and a valid method/reference. Zero creates no receipt.

The existing Firestore transaction saves the booking, aggregate inventory/hold, optional physical calendars/assignment, optional `propertyPayments` collection, and activity events together. Both room-type capacity and physical conflicts are checked under transaction retries. Physical allocation uses the existing interval/turnover engine. There is no parallel inventory or payment system.

Initial collection receipts retain the deterministic `<bookingId>_initial` ID. `paidPaise`, `propertyLedgerPaise` and `balanceDuePaise` reflect the actual collection; partial status is `partially_paid`. Existing reversal, refund, receipt, cashier and online-provider calculations consume the same ledger fields. Hotel collections are not marked as online-provider payments. Idempotent recovery returns the existing booking even if the new quote would now be sold out; changed payloads cannot reuse the same key.

The response retains booking ID/confirmation and adds saved total, collected, balance and assigned label. Quotes add a bounded, permission-filtered `roomOptions` page and creation feature availability. Room cursors are signed and bound to hotel, account, room type, stay interval and immediate/future purpose. Sparse calendar reads use batches of 20 units to remain within Firestore's expanded query component limit. Room choices are advisory; save rechecks them transactionally.

Creation, assignment and collection invalidate the selected hotel's React Query cache, refreshing the reservation list, workspace, existing dashboard, rooms and cashier data. Reservation operations now show paged activity history with staff names, timestamps and relevant amounts/room labels. No new dashboard is introduced.

## Rollout requirements

No deployment or production mutation was performed. Before deploying this version, build **two new composite indexes** from `firestore.indexes.json` and wait for them to become ready:

| Collection | Ascending fields |
| --- | --- |
| `physicalUnits` | `propertyId`, `roomTypeId` (implicit document ID ordering) |
| `physicalUnitCalendars` | `propertyId`, `unitId`, `date` |

Deploy the updated web application and rebuild/restart workers that bundle the shared booking module using the existing release process. Verify the existing payment/allocation switches for the environment. No mobile release, historical migration, live-record correction, capacity change or inventory cutover is required. Existing mobile/customer clients continue consuming shared amounts and verified customer ownership. Physical rooms and housekeeping statuses must already be registered accurately; no auto-assignment or auto-cleaning is performed.

## Verification

All writes in verification used disposable local emulators and separate test hotel/account IDs. Payment-provider responses in regression tests are mocked; no real online collection/refund was attempted. Browser tests run the real Next application against local Auth/Firestore, with desktop and 390px mobile layouts and a device timezone different from the hotel.

Commands (start local Auth/Firestore emulators first):

```sh
npm test
npm run lint
npm run typecheck -- --incremental false
npm run build -- --webpack
npm run build:workers

FIRESTORE_EMULATOR_HOST=127.0.0.1:8187 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9097 \
FIREBASE_ADMIN_PROJECT_ID=demo-helpkey-pms REDIS_DISABLED=1 \
npm run test:pms:ci

FIRESTORE_EMULATOR_HOST=127.0.0.1:8187 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9097 \
npm run test:e2e:pms-creation
```

Results are recorded below after the final checks. Cloud index enforcement/build completion, real provider delivery, physical-device native-app installation and production rollout are outside local verification. No folio, tax invoice, room board, moves, extensions, night audit or channel integration is included.

### Local verification results (14 November 2026)

- New Phase 2B checks: **3 money/domain tests, 9 isolated transaction scenarios, and 6 real desktop/mobile browser tests passed**. Coverage includes zero/partial/full collection, invalid amounts/references, permissions, simultaneous same-key retries, deliberately lost responses, final-capacity and same-physical-room races, rollback of losing advances, inactive/cross-hotel/maintenance/occupied/dirty rooms, midnight hourly assignment and release, reversing initial advances, and 53-room pagination with cursor isolation. The browser conflict response is deliberately injected to verify preservation of form input; the underlying conflicting-save behavior is separately exercised against Firestore transactions.
- Existing isolated transaction regressions: **87 passed**, covering Phase 1 foundation, Phase 2A walk-in/verified linking, reservation operations/payments/refunds, customer online booking and mocked provider confirmation/webhooks, room inventory, and stay service payments. These are in addition to the 9 new Phase 2B transaction scenarios.
- Existing browser regressions: **64 responsive partner checks, 13 Phase 1 checks, 8 Phase 2A checks and 6 receipt checks passed**. These include revocation/account isolation, confirmed creation without automatic check-in, guest registration/linking, receipt balances/refunds and hotel-local presentation. Phase 2B browser checks also verify the saved advance is immediately visible through the cashier endpoint.
- Full web unit suite: **556 passed, 128 environment-dependent cases skipped**. Applicable emulator suites above were run separately with explicit local hosts.
- Production webpack build, standalone TypeScript check, worker bundles and whitespace checks passed. Full ESLint has **zero errors and 95 existing warnings**. Desktop and mobile reservation screenshots were visually inspected.
- No cloud indexes, production deployment, live hotel data or historical records were changed. Index readiness in the hosted Firestore project and real payment-provider delivery remain deployment-time checks.

### Recovery correction and hosted index verification (14 November 2026)

An unresolved submission now remains frozen even if later retries return rate-limit, authentication, permission or validation errors. The pending request retains its uncertainty marker and exact body/key until success; overlapping submits are rejected synchronously. This prevents a later error from allowing an edited duplicate booking/advance. Ordinary first-attempt validation and room conflicts still allow correction. The six desktop/mobile tests now cover lost success followed by 429/401/403/422 and confirm one booking/receipt after recovery. Full unit checks (556 passed), TypeScript and lint (zero errors; 95 existing warnings) also pass.

The rollout index requirement above has now been checked in the configured hosted Helpkey project: both new Phase 2B indexes and all other required definitions are READY. Room-selection and calendar query plans validate with execution disabled. No index publication or live-data change was required. Application/worker deployment remains part of the normal release process.
