# Phase 3A — connected guest folio and billing

The shared reservation workspace has a Folio / Billing section with charges, payments, refunds and immutable history, plus an itemized printable statement. Cashiers read the same financial model in their restricted Operations page without access to guest contact details or general reservation APIs. Existing collection, reversal and refund controls remain the settlement workflows.

## Financial ownership

- Original room price, taxes, fees and booked extras remain booking snapshots. Existing customization credits remain authoritative and are never reposted.
- Effective reservation charges = `totalPaise - customizationCreditPaise + billingNetPaise`.
- Display/checkout balance = effective charges minus received money net of completed and reserved refunds, floored at zero. The pre-existing collection ceiling uses actual net receipts; pending refunds independently prevent collection.
- Received money, completed refunds, pending refunds and unreserved refundable excess are separately labelled. Credits create excess without returning money.
- Hotel collections/reversals/refunds use `propertyPayments`; confirmed provider captures use `paymentAttempts`, with receipt-linked `refunds`. Attempts/authorizations are informational. Reversed collections are removed from received totals.
- Supplemental services use accepted agreements, captured service payments and existing allocated service receipts/refunds. Combined captures count once; allocation identities are deduplicated. Requested/unaccepted quotes are informational. Both pools appear on the statement without cross-pool settlement.
- Reconciliation retains authoritative booking totals when history differs. It warns precisely and blocks dependent new posting/collection and settled-balance checkout while leaving safe read and receipt recovery available. Missing component breakdowns are labelled unavailable.

## Posting and authorization

`GET/POST /api/partner/bookings/{id}/folio` reads or posts `post`, `credit`, `correct`, `void`. Commands require an expected billing revision and idempotency key. The workspace additionally sends the source-model digest captured during review (`expectedStatementVersion`), so changed receipts or booking credits require another review even when billing-entry revision is unchanged. Integer paise only, bounded positive command amounts, explicit details and mandatory adjustment reasons; no inferred taxes or percentage discounts. The ledger uses signed immutable entries, with atomic compensating/replacement entries for corrections. Aggregates, revision and open-root counts update in the same transaction.

`billing.post` and `billing.adjust` belong only to owners/managers. `payment.read/collect/reverse/refund` remain independent; receptionist permissions are unchanged. Writes recheck operational access, administrative restrictions, current membership, booking state and all relevant financial dependencies before writes. Concurrent commands serialize on the booking. Duplicate voids, negative effective charges and unsafe totals are rejected.

Cancellation/no-show in partner, customer and admin release paths requires explicit neutralization of outstanding billing roots. Matching positive and negative roots do not bypass review merely because their net is zero. Existing cancellation policy remains unchanged. Booking amendments are blocked while billing roots remain open.

## Workspace and statement

Executive Reserve styling uses existing Plus Jakarta Sans, ivory canvas, white layered surfaces and navy actions. Desktop entries use an accessible table; mobile uses stacked rows. Exact paise display, source references, hotel-local dates and staff identities accompany totals and warnings. Posting forms retain drafts through refresh/stale revisions and require review. Uncertain responses freeze payload and key across later 429/401/403/422 failures until a committed replay or a server-confirmed uncommitted result resolves them. Existing Phase 2B recovery is preserved.

`GET /folio/statement?revision=…&version=…` checks the displayed revision and source-model digest. New money/refund records invalidate a stale print even if no billing entry changed. Output is labelled **Itemized billing statement — not a tax invoice.** Original booking components, entries, source receipts/refunds, separate services, totals and warnings use the same model. Reasons/internal ledger entries remain private to authorized staff; customer receipts receive only the additive billing net and effective balance fields.

Successful commands invalidate the affected hotel's Today cache and browser operational query family. Refund workers and service credit updates keep balances compatible with the additional-charge projection. Original booking/provider-order amounts remain intact.

## Release and unsupported operations

Ship compatible application and booking/refund workers together, after existing required indexes are ready. No new composite index is required by this phase. No backfill, deployment, index publication, live financial correction or policy change was performed.

Tax invoices, inferred tax breakdowns, percentage discounts, provider-order enlargement, split/transferred folios, corporate accounts, moves/extensions, night audit and integrations remain deferred. Existing service agreements must be managed in the service system, not duplicated as miscellaneous hotel charges.

## Verification

Emulator tests use unique disposable hotels/accounts and mocked providers; browser tests require explicit localhost Auth/Firestore endpoints.

- Broad Vitest regression run: **755 passed**, 21 skipped across three externally configured integration/provider suites. Command: `FIRESTORE_EMULATOR_HOST=127.0.0.1:8092 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm test -- --maxWorkers=2 --testTimeout=30000 --hookTimeout=30000 --exclude tests/booking-guest-details.emulator.test.ts`.
- Customer history suite on its required isolated `127.0.0.1:8293` emulator: **2 passed**.
- Final targeted billing and warm-cache suites: **26 passed**. Includes immutable corrections, concurrent posts/collection/credits, receipt caps, pending refunds, revocation, hotel isolation, checkout/cancellation review, stale source versions, and immediately refreshed Today queues after posting/voiding.
- Browser suites: billing **4 passed**, Today **12 passed**, reservation creation **6 passed**, covering desktop/mobile. Billing includes keyboard submission, print totals, restricted cashier read, contact isolation, preserved drafts and lost-response retries through 429/401/403/422 responses.
- TypeScript, production build, worker bundles, lint and whitespace results are recorded after the final artifact checks below.

Earlier fixture failures were corrected by recording their missing source receipts; reconciliation was not relaxed. The existing pending-refund collection blocker keeps precedence. A separate browser check caught and fixed the shared route gate's cashier folio classification. Generated build output was kept outside tracked source and generated tsconfig additions were removed. No production mutation, deployment, index publication or backfill occurred.

Final artifact checks: `npm run typecheck` passed; `HELPKEY_TEST_DIST_DIR=.next-pms npm run build` passed; `npm run build:workers` passed; `npm run lint` completed with **0 errors and 97 existing warnings**; `git diff --check` passed. Temporary Auth and isolated customer-history emulators started for verification were stopped; the pre-existing development server and Firestore emulator were preserved.
