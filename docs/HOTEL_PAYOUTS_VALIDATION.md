# Local payout validation — 2026-11-24

## Independent Step 4 review — 2026-11-24

Reviewed payout eligibility, saved agreements, deduction assessments, transactional reservations, payment journaling, request idempotency, cancellation, history, API authorization and the admin/owner interface. No reproducible payout defect was found requiring an implementation change in this review.

- Finance settings, booking finance, accounting and payout unit checks: **87 passed**.
- The corresponding four Firestore emulator suites: **50 passed, 1 skipped**. The skipped accounting projection queue-worker check requires a disposable Redis instance, which was not configured for this review; it is not counted as passed.
- Full payout browser workflow: **1 passed**, including assessment, preparation, cancellation, external payment recording, owner history and permission checks.
- Direct browser Firestore security rules: **16 assertions passed**.
- TypeScript, targeted payout/accounting ESLint and all worker bundles: passed.

All new test payouts and payment records used disposable local emulator fixtures. Real hotel payouts, booking states and commercial settings were not modified. This review did not rerun the production website build or real payment-provider integrations. Manual deduction assessment and externally executed payments remain deliberate limitations.

All payout mutations were performed on disposable localhost Firestore/Auth emulator fixtures. No real hotel payout was prepared or paid. Redis integration checks used a disposable local instance with persistence disabled.

## Reproduction

Start isolated emulators with a temporary Firebase configuration (use available ports; this run used Firestore 8198 and Auth 9198), project `demo-helpkey-finance`. Do not load production credentials. For browser tests, set `HOTEL_ACCOUNTING_START_AT=2026-11-24T00:00:00Z`; fixtures use saved checkout evidence from that date.

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8198 npx vitest run tests/payouts.test.ts tests/payouts.emulator.test.ts
FIRESTORE_EMULATOR_HOST=127.0.0.1:8198 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9198 HOTEL_ACCOUNTING_START_AT=2026-11-24T00:00:00Z npx playwright test --config playwright.payouts.config.ts
npm run typecheck
npm run build
npm run build:workers
```

The Playwright fixture starts the local Next server on port 3014 and creates disposable active-admin, owner, staff and customer accounts, a hotel, saved booking agreement, checkout evidence and reconciled accounting. Fixtures clean up their records. The website uses dummy emulator authentication only.

For manual testing with equivalent local fixtures:

1. Visit `/admin/payouts?propertyId=<fixture-hotel>` as the fixture admin. Expand **Assess deductions**, assess every category and save. Inspect the booking source link and journal link.
2. Select the booking, inspect the exact payment and **Prepare payout**. Enter a cancellation reason and **Cancel payout**. Confirm released selection can be prepared again.
3. Prepare again, enter payment date/reference/method, **Review payment**, verify hotel/reference/bookings/amount, then **Confirm recorded payment**. Check Paid history, saved booking breakdown, saved preparation terms and lifecycle history.
4. Visit `/partner/payouts?propertyId=<fixture-hotel>` as its owner at desktop/mobile widths. Verify the existing property selector and read-only history. Staff and another property's users must receive API denial.
5. Change a fixture's refund/cancellation evidence before preparation or payment; it must block the affected payout. Cancel an unpaid changed payout. Change evidence after payment, run accounting processing, and inspect preserved payment history, linked recognition reversals and review balances.

## Results

- Payout rule/transaction suite: **18 passed**. Covers unknown/explicit-zero/Not-applicable assessments and reasons, pending checkout, missing actual checkout/delay, elapsed-day boundary, pending processing, stale evidence, zero/excess deductions, timezone/cycle guidance, current combined minimum after deductions, saved delay preservation despite a current 365-day delay, off-cycle preparation, 51-booking rejection, overlapping preparation, cancellation release, identical retries/lost-response recovery, conflicting payment payloads, Paid immutability, future dates, transaction rollback, refunds/cancellations before/after preparation and after payment, payment/cancellation races, stable journal references, unchanged accounting retries, reconciliation, summary rebuild, cross-hotel isolation, inactive-admin denial and owner/staff restrictions.
- Desktop/mobile Playwright: **1 passed**, exercising assessment → preparation → cancellation → preparation → payment confirmation → Paid history, admin and owner list/detail APIs, staff/customer denial, and customer booking response privacy. Mobile width 390px has no horizontal overflow. Screenshots: `test-results/payouts/admin-confirmation.png`, `test-results/payouts/owner-mobile.png`; visually inspected.
- Finance settings, booking finance, accounting, booking domain/contracts, checkout quote, booking transactions/refund processing, stay changes/transactions and background unit regressions: **221 passed** across 13 files. The initial combined invocation skipped 10 background integration cases and one accounting queue-worker case because Redis was not configured; separate local Redis runs cover these below.
- TypeScript and targeted ESLint: passed with no errors. Navigation lint reports an existing unused `ShieldCheck` import in the partner sidebar.
- Website production build and all worker bundles: passed.

Additional background integration with real local Redis, checkout guest, and checkout recovery route regressions: **28 passed** across 3 files. Accounting emulator rerun with real Redis: **19 passed**, including the previously skipped projection queue worker. Full unrelated browser suites and live/provider payment tests were not run. Direct Firestore security-rule verification: **16 assertions passed**, denying anonymous and active-admin browser reads/writes for all four private payout collections using the existing unchanged rules. Reproduce with `FIRESTORE_EMULATOR_HOST=127.0.0.1:8198 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9198 node scripts/test-payout-browser-rules.mjs` (this loads repository rules into that disposable local emulator). Provider refund behavior is exercised by existing transaction regression mocks; no provider calls were made.
