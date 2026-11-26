# Customer booking editing

Customer editing is globally enabled for every hotel without environment flags or a hotel allowlist. New online interval-inventory bookings receive an immutable `editPolicy.version = 1` at creation. Complete older online interval-inventory bookings receive that same snapshot safely on their first edit request, so no migration or local setting is required. Manual/front-desk reservations remain hotel-assisted. The same booking ID, owner, reference, hotel, booking mode, cancellation restrictions, and original payment arrangement survive editing.

## Enablement and configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `BOOKING_WHATSAPP` | disabled | Create WhatsApp deliveries for committed updates. |
| `WHATSAPP_BOOKING_API_URL` | unset | Separate HTTPS Dineezy booking-update endpoint. |
| `WHATSAPP_BOOKING_API_KEY` | unset | Separate booking-update credentials; no OTP fallback. |
| `BOOKING_AMENDMENT_INTERVAL_MS` | 15000 | Legacy worker amendment-expiry sweep interval. |

Hotel Settings exposes the stay-change cutoff, reservations WhatsApp contact, and explicit equivalent packages across room categories. Cutoffs and mappings are copied into new bookings and safely snapshotted for eligible older online bookings when they are first edited. The default cutoff is zero hours before scheduled arrival. Names/contact remain editable until scheduled arrival; actual check-in always closes editing. Hotel policy changes do not rewrite saved agreements.

Deploy the new `bookings(amendmentPending, amendmentExpiresAt)` index and compatible app/booking/recovery workers before deploying the feature. Existing indexes continue serving payment, refund, and notification recovery. Firestore clients remain denied direct access by the existing rules; all new records use private Admin SDK paths.

## Agreements and money

Quotes expire after five minutes without reserving inventory. Amendment acceptance is idempotent and revision checked. Pending payment reserves only additional inventory for up to ten minutes, capped by the current editing deadline and proposed arrival. Original confirmed inventory is retained until successful application.

The accepted accommodation floor covers accommodation, accommodation tax, and booking charges. A cheaper proposal retains the last accepted component breakdown and displays its published price and retained difference separately. A lower-price proposal with incompatible tax treatment requires hotel assistance. Discarded previews never raise the floor. Saved pending checkout replacements do raise it, while preserving or shortening the original hold expiry.

Deposit percentage, full-payment, and pay-at-hotel arrangements remain fixed. Credit comes from identifiable accommodation receipts and hotel collections, excluding service allocations, refunded funds, and refund reservations. Missing monetary evidence blocks automatic collection. Unallocated hotel receipts bundled with original services, or refunds against mixed accommodation/service captures without allocation evidence, require finance assistance. Discounted bookings require hotel assistance for stay changes.

The original finance agreement stays intact. Applied revisions are appended under `bookingFinanceAgreementsV1/{bookingId}/accommodationRevisions`, with an active-agreement reference on the original record. Commission terms remain fixed. Finance, accounting, payouts/dues, checkout proof, and invoice sources consume the revised agreement through the existing shared models. Unsupported adjustments and refund/invoice inconsistencies retain review gates. Issued documents are never rewritten.

Every provider order has an immutable `bookingPaymentOrdersV1` mapping with purpose, revision, amount, currency, and service allocation. Superseded orders cannot confirm a replacement, including equal-priced orders. Late/unusable captures become identifiable refund records. Refunds remain limited to available amounts on each individual payment receipt. Historical unusable captures and refunds stay in gross receipt totals when a replacement is eventually paid. A fully refunded current order requires a fresh reviewed replacement; it is never reopened for payment.

## Services and customer experience

My Trips and booking details expose Edit booking separately from cancellation. The editor retains the draft after conflicts, recovers active operations on reopening, and reports success only from saved server outcomes. Names, contacts, occupant counts, room/package choices, dates, and hourly duration are validated server-side. Account credentials, ownership, refund recipient, and invoice/GST identity are excluded.

Compatible services are carried forward. Affected schedules require an approval bound to the exact stay proposal and current service version; the original schedule remains effective until application. Preparing services, incompatible quantities/inclusions, expired deadlines, and unreconciled refunds require the existing hotel agreement/cancellation workflows. Closed paid/refunded history does not block; outstanding refunds still do. Pending versioned bookings can submit unpriced custom requests while their original hold is valid; agreement/payment workflows remain separate.

Arrival plans and guest-review confirmations are reset by stay/occupant amendments. Legacy adult-name/contact fields are synchronized with the occupant list; renamed adults lose their previous identity fragments.

## Recovery and operations

The dedicated `amendments` task releases expired inventory independently of provider availability or payment-recovery attention flags. It is dispatched after commits, reconstructed from Firestore by recovery, and supported by both legacy and queue booking runners. Actual check-in schedules immediate cleanup. Cancellation releases amendment inventory in the cancellation transaction.

Order creation persists its intent before contacting Razorpay. A lost response is recovered by its unique receipt and notes; never blindly recreate an uncertain order. Definitive order rejection restores the original checkout. Zero or multiple matching orders remain blocked for reconciliation rather than guessing.

Useful read-only checks:

```sh
node --env-file=.env.local --import tsx scripts/booking-editing-audit.ts --property HOTEL_ID
node --env-file=.env.local --import tsx scripts/booking-inventory-reconcile.ts --property HOTEL_ID
```

The inventory audit includes active additional amendment allocations. The editing audit reports expired/stranded holds, uncertain orders, receipt mismatches, outstanding unusable-capture refunds, and failed notifications without printing customer/provider payloads. Admin Workers exposes the amendment queue/heartbeat, attention records, and dead notification deliveries.

Customer editing and pending-checkout replacement have no environment enable/disable switches. New online interval-inventory bookings automatically receive a saved editing policy; eligible older online bookings initialise it on their first edit request. Booking/recovery workers, payment verification, status reads, refunds, and cleanup must remain running. Turning WhatsApp off stops creation of new recipient jobs; already queued deliveries keep their independent retry lifecycle.

WhatsApp deliveries use immutable committed content and per-recipient outbox records with leases and six bounded attempts. Provider errors never undo a booking. As with any provider lacking an idempotent send API, an uncertain send can be delivered more than once; booking and financial application remain idempotent. OTP delivery is unchanged.

## Verification and release gates

```sh
npm test
FIRESTORE_EMULATOR_HOST=127.0.0.1:8096 TEST_REDIS_URL=redis://127.0.0.1:6398 npx vitest run tests/customer-amendments.emulator.test.ts tests/booking-transactions.emulator.test.ts tests/booking-finance.emulator.test.ts tests/stay-transactions.emulator.test.ts tests/service-finance.emulator.test.ts tests/queue-delivery.integration.test.ts
npx playwright test -c playwright.booking-editing.config.ts
npm run typecheck
npm run lint
npm run build:workers
HELPKEY_TEST_DIST_DIR=.next-booking-edit-build npm run build -- --webpack
```

Use disposable local Firestore and Redis instances for integration tests. Never point emulator suites at production.

The opt-in `customer-amendments.sandbox.test.ts` requires a local emulator and `rzp_test_` credentials. Start the isolated browser fixture on port 3019, then run:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8096 RUN_BOOKING_EDIT_SANDBOX=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/customer-amendments.sandbox.test.ts
```

The actual Razorpay sandbox run verified separate deposit-difference capture, application, and cancellation refunds across two receipts. WhatsApp delivery remains gated: separate booking credentials/endpoint and a designated test recipient are not configured. Validate the real Dineezy response contract, successful receipt, failures, and retries before enabling `BOOKING_WHATSAPP`.

Deployment requires all local checks and compatible indexes/workers. WhatsApp delivery separately requires its provider checks and credentials. Editing itself requires no environment configuration.

### Local validation result — 2026-11-26

- Full default suite: 784 passed; opt-in/emulator suites skip without their explicit services.
- Focused Firestore/Redis regression run: 144 passed across nine suites, including 31 customer amendment scenarios.
- Separate saved-guest projection emulator suite: 2 passed; guest-detail unit suite: 16 passed.
- Customer editing browser suite: 6 passed across desktop/mobile, conflicts, services, recovery, and guest-only edits.
- Real Razorpay TEST lifecycle: 1 passed (original deposit, independent amendment difference, application, and refunds across both receipts).
- TypeScript, production webpack build, and worker bundles passed. Lint passed with 117 warnings and zero errors; generated `.next*` build directories are excluded.
- `git diff --check` passed. No production deployment, index deployment, production enablement, or real WhatsApp message was performed.

### Follow-up verification — 2026-11-26

- Fixed edited occupant lists not being marked as canonical registration: front-desk checks now recognize supplied child and infant names, including after a later name correction.
- Locked the customer draft while reviewing/saving and added a synchronous action guard so an in-flight quote cannot be shown against different form values.
- Returned the saved hotel timezone in edit options and used it for customer review times and deadlines, including customers browsing from another timezone.
- Full default suite: 785 passed; 326 service-dependent tests skipped. Six explicit local Firestore/Redis integration suites passed 107 tests before these fixes; the amended customer suite then passed all 32 scenarios, including the new family-registration regression.
- Browser verification: 8 passed, including draft locking and hotel-time display from a Los Angeles browser. TypeScript, production webpack build, worker bundles, and whitespace checks passed. Lint reported zero errors and 117 existing warnings.
- This verification used disposable local services and mocked provider responses. It did not repeat live Razorpay sandbox or WhatsApp delivery checks, enable production flags, or deploy the project.

### Global enablement follow-up — 2026-11-26

- Removed all customer-editing environment flags and hotel allowlists. Every supported online interval-inventory booking is eligible at every hotel.
- Eligible bookings created before this feature now initialise their immutable editing policy transactionally when their owner first opens Edit booking; no data migration or local environment configuration is required.
- TypeScript and the full default suite passed: 786 tests passed; 326 service-dependent tests skipped without local emulator services.
