# Step 6: Complete finance flow validation

Verified on 2026-11-25 using disposable localhost Firebase emulators and Redis. No live bookings, finance settings, receipts, payouts or refunds were changed. No external bank or payment-provider operation was performed.

## Joined scenarios

`tests/finance-flow.emulator.test.ts` exercises real booking creation, private finance snapshot creation, online payment confirmation, hotel collection, check-in/checkout, accounting, payout preparation/payment recording, dues receipt recording and owner reads. Only provider HTTP responses are mocked. The eligibility clock is advanced to the booked arrival for lifecycle actions; saved prices and charge evidence are not manually rewritten. Payout waiting periods are checked from saved checkout evidence rather than waiting two real days.

The room costs ₹2,000 plus ₹100 guest tax. Room-only commission is 10%, or ₹200. These are test amounts, not tax or commercial recommendations. Other deduction categories are explicitly assessed as zero/not applicable for the fixtures only.

| Scenario | Verified result before external settlement |
| --- | --- |
| Full online payment | ₹2,100 collected online; ₹200 commission; ₹1,900 payable to hotel |
| 25% online advance | ₹525 online; ₹1,575 collected by hotel; ₹200 commission; ₹325 payable to hotel |
| Pay at hotel | ₹2,100 collected by hotel; ₹200 owed to Helpkey |
| Saved two-day wait | Payout blocked until saved eligibility date; changing current default to zero does not shorten the existing agreement |
| Direct reservation | Full hotel collection; zero marketplace commission and zero dues |
| Walk-in | Full hotel collection; zero marketplace commission and zero dues |
| Cancellation with full refund | ₹2,100 refunded once; no earned commission or hotel payout available |

The ₹325 deposit-case payable cannot be prepared with a ₹500 minimum. The test verifies that rejection, then explicitly lowers only its disposable hotel's minimum to test settlement completion. It does not change the booking agreement or waive any production restriction.

Joined tests also verify that commissions remain unchanged after current settings change, pre-checkout payments remain pending, collection and external-settlement retries do not duplicate money, reconciliation agrees with saved balances, owner/admin account totals match and private settlement fields stay out of customer booking responses. After external payout/dues recording, balances clear and accounting retries do not recreate them.

## Results

- Joined booking-to-settlement integration: **7 passed**.
- Finance/booking/stay-change regression: **117 passed, 1 skipped** across eight files. Covers saved terms, transaction races, refunds, changed evidence, add-ons, corrections, stay changes, payout reservations and hotel isolation.
- Local Redis accounting/background run: **29 passed**, including the worker test skipped above. This run repeats the accounting integration file to enable its real queue test.
- Targeted unit regression: **150 passed** across ten files.
- Combined browser suite: **5 passed**, covering actual booking creation and the admin/owner booking-finance, accounting, payouts and dues screens, access restrictions, payment history, corrections and stale confirmations. The separate initial accounting browser run also passed both tests.
- Firestore browser-access checks: **20 dues assertions** and **16 payout assertions** passed.
- TypeScript, targeted lint for the new test/config and whitespace checks passed.

Initial development of the joined fixture exposed an invalid fixture setting name; it was corrected before all seven scenarios passed. No product behavior needed changing based on this verification.

## Reproduce

Run from `web`, with explicit disposable localhost Firestore/Auth emulators at ports 8198/9198. Use demo project IDs, load the repository's `firestore.rules`, and allow the emulator to serve the different demo projects used by existing tests (`singleProjectMode: false`). Never load production credentials or `.env.local` into these commands. The browser fixture server uses dummy credentials, disables Redis/provider access, and runs on port 3014. Run the browser command sequentially with other browser suites because they share that port and build directory.

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8198 npx vitest run tests/finance-flow.emulator.test.ts

FIRESTORE_EMULATOR_HOST=127.0.0.1:8198 npx vitest run --maxWorkers=2 tests/finance-settings.emulator.test.ts tests/booking-finance.emulator.test.ts tests/accounting.emulator.test.ts tests/payouts.emulator.test.ts tests/dues.emulator.test.ts tests/service-finance.emulator.test.ts tests/booking-transactions.emulator.test.ts tests/stay-changes.emulator.test.ts

FIRESTORE_EMULATOR_HOST=127.0.0.1:8198 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9198 HOTEL_ACCOUNTING_START_AT=2026-11-24T00:00:00Z npx playwright test --config playwright.finance-flow.config.ts

FIRESTORE_EMULATOR_HOST=127.0.0.1:8198 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9198 node scripts/test-dues-browser-rules.mjs
FIRESTORE_EMULATOR_HOST=127.0.0.1:8198 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9198 node scripts/test-payout-browser-rules.mjs

# Start a disposable Redis bound to localhost:6398, with persistence disabled, first.
FIRESTORE_EMULATOR_HOST=127.0.0.1:8198 TEST_REDIS_URL=redis://127.0.0.1:6398 REDIS_URL=redis://127.0.0.1:6398 npx vitest run --maxWorkers=2 tests/accounting.emulator.test.ts tests/background.integration.test.ts

npm run typecheck
npx eslint tests/finance-flow.emulator.test.ts playwright.finance-flow.config.ts
```

## Remaining scope

This verifies the implemented finance flow with local test data. It does not verify live gateway/bank behavior or establish production tax, statutory deduction or gateway-fee rules. Required unknown deductions still block payout preparation. Current rate plans still determine guest checkout splits. External payout/dues recording does not transfer money, offset unrelated balances or automatically restrict bookings.

Step 7 should inspect the existing deduction assessment and settlement statement, then address only actual gaps once production business rules are confirmed.
