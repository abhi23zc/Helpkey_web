# Hotel Dues validation — 2026-11-24

All receipts, corrections and replacements were recorded against disposable localhost emulator fixtures. No real hotel payment or correction was recorded. Existing work and deleted legacy finance modules were preserved; no mobile files were changed.

## Reproducing the checks

Use isolated Firestore/Auth emulators with project `demo-helpkey-finance`; this run used `127.0.0.1:8198` and `127.0.0.1:9198`. Load the repository's Firestore rules. The scripts refuse non-local emulator hosts. The local browser server uses dummy emulator credentials, disabled Redis/provider payments and port 3014.

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8198 npx vitest run tests/dues.test.ts tests/dues.emulator.test.ts
FIRESTORE_EMULATOR_HOST=127.0.0.1:8198 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9198 HOTEL_ACCOUNTING_START_AT=2026-11-24T00:00:00Z npx playwright test --config playwright.dues.config.ts
FIRESTORE_EMULATOR_HOST=127.0.0.1:8198 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9198 node scripts/test-dues-browser-rules.mjs
npm run typecheck
npm run build
npm run build:workers
```

For background integration, start a disposable Redis bound to localhost with persistence disabled, then run:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8198 TEST_REDIS_URL=redis://127.0.0.1:6398 REDIS_URL=redis://127.0.0.1:6398 npx vitest run tests/background.integration.test.ts tests/accounting.emulator.test.ts
```

## Exact manual pages and actions

Use a disposable hotel with completed, accounted pay-at-hotel bookings and saved agreements. The Playwright fixture creates admin/owner/staff/customer users and a hotel with Booking A owing ₹200 and Booking B owing ₹300, then deletes its data. To explore those fixtures interactively, run the browser command above with `--debug`, step through login/navigation, and pause once `/admin/dues?propertyId=<fixture-hotel-id>` loads. Do not substitute real hotel data for these checks.

1. As admin, open **Hotel Dues** (`/admin/dues`) and select the test hotel. Verify the three main summaries and **Dues policy** disclosure; warnings are advisory and no overdue dates are shown.
2. In **Outstanding**, select A and B and choose **Record payment received**. Blank amount must fail. Enter ₹350, a valid payment date, method and unique local transaction reference.
3. Choose **Review allocation**. Verify the hotel, ₹350, reference, A receiving ₹200, B receiving ₹150 and B remaining ₹150. Choose **Confirm payment received**. Verify Outstanding ₹150 and Payments received ₹350.
4. In **Payment history**, expand **Booking allocations and history**. Choose **Correct recording**, enter a reason, **Review correction**, then **Confirm correction**. Verify original allocations are restored, the original receipt remains and it cannot be corrected twice. No bank refund occurs.
5. Choose **Record replacement** on the corrected record. Confirm that its method/reference are retained, select the intended bookings and review/confirm a replacement. Inspect permanent links and totals; unrelated reuse of the reference must fail.
6. Open a confirmation in one admin session; clear the same booking from another session. Confirm the first session must stop and ask for updated review. Cleared bookings must leave the selected list; no old allocation can be committed.
7. Open **View accounting** and inspect payment/correction entries. Retry accounting and rebuild summaries; recorded allocations must remain. Change a local booking/refund source after payment and process accounting: it must enter Needs attention without reallocating money.
8. As hotel owner, open `/partner/dues?propertyId=<fixture-hotel-id>` and inspect Outstanding/Needs attention/Payment history at desktop and 390px width. Recording/correction controls must be absent. Staff and another hotel owner must receive API denial.

## Results and limits

- Dues rule/transaction tests: **20 passed**. Cover precise rupee validation, completed pay-at-hotel dues from saved terms, current-policy isolation, ordering/ties, full and partial payments, overpayment and 51-booking rejection, invalid/future dates, unknown evidence, duplicate requests and references, concurrent admins, stale/expired confirmations, full corrections, double-reversal prevention, linked replacement restrictions, atomic rollback, missing/corrupt journal evidence, refunds/cancellations after receipt, corrections after a booking disappears, accounting retries/reconciliation/rebuilds, owner access and hotel isolation, and independent payout settlement in the same hotel.
- Broader regression run: **290 passed, 1 skipped** across 21 files (before the final additional dues cases). Includes finance settings, booking finance, saved service agreements and add-on settlement, payouts, accounting, booking/domain/contracts, checkout/guest/recovery, refund transactions, stay changes and background unit checks. The skipped accounting Redis-worker case passed in the separate Redis run.
- Real local Redis background/accounting integration: **29 passed**, including the accounting projection worker.
- Browser: **1 passed**, covering partial allocation, blank amount rejection, full correction, same-reference linked replacement, owner mobile history, admin/owner list/detail APIs, staff/customer denial and customer-response privacy. The final extension passed stale-confirmation selection recovery after another recording cleared the selected booking. The existing Payouts desktop/mobile browser regression also passed (**1 passed**). Desktop and mobile screenshots were visually inspected: `test-results/dues/admin-confirmation.png`, `test-results/dues/owner-mobile.png`; mobile has no horizontal overflow.
- Firestore rules: **20 assertions passed**, denying anonymous and active-admin browser reads/writes across all five dues collections, using the unchanged repository rules.
- TypeScript, targeted lint, website production build and worker bundles passed. Expanded navigation lint has one pre-existing unused `ShieldCheck` import warning in the partner sidebar.

The initial browser runs exposed a status-message locator ambiguity and a development compilation wait shorter than the owner workspace load. The locator was scoped and the local-browser assertion timeout increased; the complete flow subsequently passed. The main flow was also reviewed for stale selections, and the UI now removes bookings that no longer have verified dues before a new confirmation.

Full unrelated browser suites and live bank/provider tests are outside these checks. No overdue rule is implemented because its starting event and policy are undefined. Payments needing source review remain blocked from collection; correction does not approve unsupported financial changes or send money back through a bank.

## Follow-up implementation review

Fixed payment history so one hotel receipt allocated across bookings shows every affected booking and one total, with a stable receipt-level entry. Corrections are marked as recording-only events. Switching hotels clears the full payment draft, and the selected hotel remains visible while paging the hotel directory. Historical bookings without posted money, saved balances or payment records no longer create irrelevant dues alerts. Warning thresholds and limits do not generate alerts for a zero outstanding balance.

Local verification: 104 tests passed across dues, accounting, payouts, service finance, booking finance and finance settings; TypeScript and targeted lint passed. After the sign-in blocker was resolved, the follow-up emulator run passed 51 tests with one Redis-dependent accounting test skipped across dues unit/integration, accounting integration and payouts integration. This includes the new historical-exclusion and zero-balance-warning regression. All 20 Firestore security-rule assertions passed. The full dues browser flow passed: partial payment, correction, linked replacement, owner read-only access, staff/customer restrictions and stale-confirmation recovery. The desktop confirmation screenshot was inspected. Temporary test services were stopped after validation. No real receipts, corrections, hotel settings or payments were changed.
