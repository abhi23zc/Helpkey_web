# Step 7 — Payout deduction review and settlement statements

Implemented and checked on 2026-11-25. All payment, assessment and statement fixtures were disposable local emulator data. No real hotel settings, bookings, payments, receipts or refunds were changed.

## Delivered behavior

- The editor has four distinct choices: Not reviewed, Enter amount, Confirmed ₹0 and Not applicable. Reasons are mandatory. Blank amounts are never treated as zero. Decimal rupees convert exactly to paise; invalid precision, negative/excess amounts and deductions leaving no positive payment are rejected.
- Selecting bookings now leads to a server-backed review before preparation. Preview reserves nothing. Confirmation rereads evidence, assessments, reservations and current preparation settings and checks the review fingerprint. Changed selections or a refreshed workspace clear the visible review. Stale confirmations fail without creating a payout.
- Admins and owners can open the same readable settlement statement with Print / Save as PDF. Saved amounts are shown without recalculating commission or using current commercial settings. Internal notes, reasons, actor IDs and technical metadata are excluded. Prepared, Paid, Cancelled and later review warnings remain distinct. Printing does not send money or issue a tax invoice.

## Automated checks

- Seven statement/input unit cases plus finance unit regression: **111 passed** across seven files.
- Finance integration regression: **80 passed, 1 skipped** across settings, booking finance, accounting, payouts, dues, service finance and the joined Step 6 flow. The skipped case requires Redis; no posting or worker behavior was changed in Step 7. The payout file now includes 14 cases, including read-only preview, stale assessment/policy/selection/source rejection, exact preparation replay, permission/isolation checks and positive-payment validation.
- Final sequential finance browser run: **5 passed**, covering actual booking creation, accounting/add-on history, dues and the updated payout workflow. The payout scenario verifies all review choices, invalid precision, ₹2,100 online less ₹200 commission and ₹20 fee yielding ₹1,880, selection invalidation, a stale policy rejection, fresh confirmation, cancellation, payment recording, owner statement equality, cross-hotel denial, staff/customer denial and owner denial of preparation preview.
- Statement HTML checks include private/no-store headers, escaping, missing historical values, omission of internal information, status labels and print controls.
- Browser printing generated a **one-page** A4 landscape statement and an **eight-page** 50-booking statement with long references. Poppler rendering was inspected for the single page, continuation headings and final page. The last booking and footer remain present and print controls are absent. No clipping was observed in the final rendering.
- TypeScript and targeted lint passed. The website production build and all worker bundles passed. The website build used the separate existing finance test build directory and emulator credentials.

During development, the browser caught a client/server dependency import, which was fixed by moving the shared deduction schema to a client-safe module. The stale-review UI test was corrected to assert an error alert. Print review exposed excess page length; repeated deduction cards were replaced by a compact table and print spacing was tightened. One combined browser/integration run lost a service-review success notice while suites shared emulator settings; running the final browser suite sequentially passed all five cases. Run these groups sequentially rather than concurrently against the same demo project.

## Reproduce

Use explicit local Firebase emulators (`127.0.0.1:8198`, Auth `127.0.0.1:9198`) with demo projects and the repository rules. Do not load production credentials or `.env.local` into test commands.

```sh
npx vitest run tests/payout-statement.test.ts tests/payouts.test.ts tests/dues.test.ts tests/accounting.test.ts tests/service-finance.test.ts tests/booking-finance.test.ts tests/finance-settings.test.ts

FIRESTORE_EMULATOR_HOST=127.0.0.1:8198 npx vitest run --maxWorkers=2 tests/finance-settings.emulator.test.ts tests/booking-finance.emulator.test.ts tests/accounting.emulator.test.ts tests/payouts.emulator.test.ts tests/dues.emulator.test.ts tests/service-finance.emulator.test.ts tests/finance-flow.emulator.test.ts

FIRESTORE_EMULATOR_HOST=127.0.0.1:8198 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9198 HOTEL_ACCOUNTING_START_AT=2026-11-24T00:00:00Z npx playwright test --config playwright.finance-flow.config.ts

npm run typecheck
```

Browser screenshots and print PDFs are test artifacts under `test-results/payouts/`. These are sample documents, not production settlement statements. Existing records need no migration. Live provider/bank verification and deciding production tax/statutory/fee rules remain outside Step 7.
