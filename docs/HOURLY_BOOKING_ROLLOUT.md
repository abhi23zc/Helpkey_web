# Hourly and overnight booking rollout

The new engine is selected per property with `inventoryEngine: interval_v1`. Do not change this field manually. A converted property uses interval inventory for both booking modes; an unconverted property only accepts legacy overnight reservations.

New properties created by either onboarding entry point now start with interval inventory. Existing drafts retain their selected engine. Timezone editing is permitted before allocation; a migrated property or one with calendar records keeps its timezone locked.

## Local verification

- `npm test`: pure booking/time/pricing/reporting tests and existing platform tests. Emulator tests skip unless `FIRESTORE_EMULATOR_HOST` is explicitly set.
- `FIRESTORE_EMULATOR_HOST=127.0.0.1:8092 npm run test:bookings:emulator`: real Firestore transaction contention, idempotency, mixed modes, late payment, refund retry, maintenance, authorization, and conversion/reconciliation.
- Use Java 21 or newer for the cached Firestore emulator. CI starts it through `firebase-tools emulators:exec` against `demo-helpkey-bookings`.
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run build:workers`.
- `npm run dev` starts Next.js and the booking worker together. `npm run all` includes both through that command alongside the existing media/projection workers.
- `npm run build -- --webpack` is the verified fallback where the local Turbopack process cannot bind its required port. The installed Next.js guide documents `experimental.useTypeScriptCli: false`; the configuration uses this compiler-API path because subprocess `--showConfig` output was intermittently empty. Full type checking remains enabled.
- The hourly Playwright journey requires an app server pointed at the same isolated `demo-helpkey-bookings` emulator. It verifies search, room selection and authoritative checkout pricing without submitting a reservation or taking a payment. Set `PLAYWRIGHT_BASE_URL` and `FIRESTORE_EMULATOR_HOST`, then run `npx playwright test tests/e2e/hourly-booking.spec.ts`.

## Conversion

1. Deploy indexes from `firestore.indexes.json` and wait for them to finish building. `npm run bookings:indexes` reports booking-index readiness without writing; `--apply` adds missing indexes when the service account has index-management permission. Alternatively use an authorized Firebase CLI account with `firebase deploy --only firestore:indexes --project PROJECT_ID --non-interactive` (without `--force`, existing extra indexes are preserved).
2. Stop offering the property for new bookings (`isBookable: false`). Do not run old application versions that ignore this flag or the engine selector.
3. Run `npm run bookings:cutover -- --property PROPERTY_ID`. This is read-only by default. Review unresolved room IDs, over-capacity dates and transaction size.
4. Map legacy free-text manual reservations to real room-type IDs using a JSON object `{ "bookingId": "roomTypeId" }`. Run the dry-run again with `--mapping PATH`.
5. With a clean report, repeat with `--apply`. The transaction preserves historical fields and old nightly counters, writes exact interval allocations and changes the property engine atomically. Legacy pending online sessions enter payment reconciliation so missed captures remain recoverable after expiry. It refuses existing interval data or more than 450 writes; larger properties require a staged conversion procedure.
6. Run `npm run bookings:reconcile -- --property PROPERTY_ID`. This read-only audit compares all calendar counters to unreleased holds and active maintenance blocks. Any drift exits nonzero. Do not repair counters without tracing their source.
7. Verify arrivals, departures, cleaning boundaries, existing payment sessions and cancellation release before reopening the property. Configure property/room booking modes and publish separate package or flexible rates.

Once interval inventory exists, the property timezone is immutable through the property editor. Moving calendar groupings without conversion could separate overlapping UTC intervals into different documents. Buffer and rate changes affect new reservations; releases use stored allocations.

## Maintenance

Run the `booking-worker` Docker Compose service, or `npm run worker:bookings` after building workers. Configure `CRON_SECRET` and `BOOKING_WORKER_URL` (default `http://127.0.0.1:3000`; Compose uses `http://web:3000`). It calls the authenticated `/api/internal/bookings/expire` endpoint with separate expiry, payment, refund and notification tasks. Independent loops run every 15 seconds after each bounded batch; payment-provider latency does not delay expiry.

Monitor `booking.maintenance` and `booking.maintenance_failed` logs, batch failure IDs, `hasMore`, and the reconciliation audit. Refunds expose status, attempts, provider IDs and errors in the admin booking timeline. Pending provider outcomes are retried with a stable Razorpay refund idempotency key; a terminal provider rejection requires reconciliation before another attempt. Ambiguous order creation is recovered by receipt, never by issuing another booking/order. Unpaid expired orders remain on a five-minute reconciliation cycle so missed captures can still be refunded; retention/archival for these records needs an operational policy.

Notifications are durable in-app notifications delivered through `bookingNotificationOutbox`. Email, SMS and WhatsApp delivery are outside this implementation.

## Verification and activation on 2026-10-20

Cosmozin Hotel (`0m4Z3nPKA0DJOlSbgxoL`) was closed to new bookings, converted atomically, reconciled and reopened. Conversion included 13 reservations and 24 calendars. All 17 booking records were preserved. Reconciliation reported zero drift before and after expiry. Eight migrated expired online sessions were scheduled for payment reconciliation. All required booking indexes are deployed and ready. The local booking worker is running; both Docker Compose and `npm run all` include it for subsequent startup.

Verification includes unit tests, Firestore transaction tests, the homepage-to-checkout browser journey, TypeScript, lint, production build and worker build. The opt-in `tests/booking-razorpay.sandbox.test.ts` uses actual Razorpay test-mode order creation, a mock-bank payment, capture, booking confirmation, deposit balance and cancellation refund while keeping every Helpkey booking record in a local emulator. It rejects cloud Firestore and live Razorpay keys. Run it with `RUN_RAZORPAY_SANDBOX=1 FIRESTORE_EMULATOR_HOST=127.0.0.1:8092 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3101 node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/booking-razorpay.sandbox.test.ts`; the app at that URL must point to the demo database.

The configured Razorpay keys remain in test mode. No real-money charge or refund was submitted. A hosted production application/worker deployment and public Razorpay webhook registration were not performed. Local payment reconciliation polling is active; the webhook secret/public endpoint still need configuration for a hosted release. Authenticated browser journeys across customer, partner and admin roles remain a staging release check.

Customer search evaluates the requested stay before sorting/pagination, with a 1,000-property candidate bound. Reservation lists/reporting currently read the complete selected property (or filtered admin booking set) before calculating summaries and slicing cursor pages. This is accurate but requires workload measurement and later projections for large accounts. Rate discovery retains the existing 50-room/100-rate catalog bounds.

## Duration price list replacement

New hourly rates use only `pricingModel: duration` and `durationPrices: [{ hours, pricePaise }]`. Partners enter independent totals for any subset of whole-hour stays from 1–24 hours (for example, 1 hour ₹200, 2 hours ₹300). There is no inferred price for a missing duration. Arrivals still use 15-minute steps; cleaning, operating windows, inventory and payment controls are unchanged. Taxes and fees are added to the selected duration's total.

The editor is shared by onboarding and Rooms; the listing editor uses the same duration-price component. Old hourly rates do not satisfy sellability or appear in new booking choices. Partners must add fresh hourly prices. Overnight pricing is unchanged.

Preview archival using `npm run bookings:archive-old-hourly` (optionally `-- --property ID`), then apply with `npm run bookings:archive-old-hourly -- --apply`. Run again to confirm no remaining affected rates. The migration rereads each rate transactionally, retains all fields, archives only obsolete hourly rates, and queues catalog projections/cache invalidation. Run the projection dispatcher/worker to drain those jobs. Deploy the new application and workers together to prevent old application instances accepting old models. Existing booking documents, amounts, policies and allocations are never migrated; unexpired payment holds can confirm after their source rate is archived.

New UI/API requests reject partial-hour durations and old model writes. Old shareable hourly links with partial hours require a new whole-hour selection; existing booking and receipt links remain usable. Run unit, emulator, browser, TypeScript, lint, production and worker builds after changing the pricing contract.
