# Step 8 validation — 25 November 2026

All mutations used disposable fixture hotels, users, accounts and payments in the `demo-helpkey-finance` localhost project. No real bank information, hotel setup or payments were changed.

## Results

- **134 unit tests passed** across readiness/encryption, payouts, settlement statements, finance settings, invoices, billing, accounting, booking finance and service finance.
- **101 distinct emulator cases passed** across nine suites: readiness (9), payouts (15), finance flow (7), finance settings (10), accounting (19), invoices (15), billing (10), booking finance (11), service finance (5).
- The combined emulator run initially passed 100 cases and failed the optional accounting queue case because an existing localhost Redis port required authentication. A separate disposable Redis container on port 6399 resolved the fixture issue; all 19 accounting cases, including the real queue worker, then passed. No application change was needed for that setup issue.
- **8 combined Playwright tests passed**, covering finance settings, accounting, payouts and readiness. The new readiness test exercises the admin business/profile and bank editors, admin bank review, owner update and deliberate reveal/hide, review invalidation after owner edits, staff denial, and reveal no-store headers. The final targeted rerun also passed inactive-admin denial and guest-response privacy assertions.
- Desktop (1280px) and mobile (390px) screenshots were inspected. Tests wait for the existing admin sidebar padding transition before measuring the mobile layout. Admin readiness and owner banking have no horizontal overflow at mobile width.
- **24 Firestore rule assertions passed**: anonymous and active-admin browser reads/writes denied across payout, private bank and readiness collections.
- TypeScript, targeted ESLint (zero warnings/errors), production website build with webpack, worker builds and `git diff --check` passed.

## Covered behaviours

Profile fallback works without invoice/tax configuration; missing setup takes precedence over reviews. Bank review takes priority when setup is complete. Invoice identity editing preserves unrelated fields and rejects changes to issued registration identity. Relevant identity and commercial edits invalidate reviews; invoice footer/numbering and unrelated finance edits do not. Inheritance changes and weekly weekday completeness are covered by the pure terms tests.

Bank tests preserve leading zeroes, validate confirmation/IFSC/digits, use authenticated encryption bound to property and owner, reject reveal using another owner binding, fail storage/reveal when configuration is missing, and keep account numbers out of normal reads, masked histories and receipts. Staff, inactive administrators, stale owners and cross-hotel callers are denied. Duplicate and no-op saves preserve bank version/review; stale drafts conflict; concurrent bank save/review commits only one action.

Payout coverage includes unknown legacy bank baselines, unchanged bank preparations without acknowledgement, bank changes after preparation, renewed acknowledgement after another change, immutable preparation and payment-time snapshots, lost-response retries, paid-statement immutability, cancellation, atomic rollback, preserved booking checks, and hiding former-owner bank metadata from a new owner.

## Reproduction

Use localhost Auth and Firestore emulators with project `demo-helpkey-finance`; the browser fixture server refuses non-local emulator addresses. Set `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`, and a **disposable** 64-character hex `HOTEL_BANK_ENCRYPTION_KEY` for browser testing. Set `REDIS_URL` to a disposable localhost Redis to include the accounting queue case.

```sh
npm test -- tests/payout-readiness.test.ts tests/payouts.test.ts tests/payout-statement.test.ts tests/finance-settings.test.ts tests/invoices.test.ts tests/billing.test.ts tests/accounting.test.ts tests/booking-finance.test.ts tests/service-finance.test.ts
npm test -- --maxWorkers=1 tests/payout-readiness.emulator.test.ts tests/payouts.emulator.test.ts tests/finance-flow.emulator.test.ts tests/finance-settings.emulator.test.ts tests/accounting.emulator.test.ts tests/invoices.emulator.test.ts tests/billing.emulator.test.ts tests/booking-finance.emulator.test.ts tests/service-finance.emulator.test.ts
npx playwright test -c playwright.payout-readiness.config.ts
node scripts/test-payout-browser-rules.mjs
npm run typecheck
HELPKEY_TEST_DIST_DIR=.next-step8-build npm run build -- --webpack
npm run build:workers
```

Build/test logs for this session are in `/private/tmp/helpkey-step8-*`. Browser artifacts are in `test-results/payouts`, `test-results/payout-readiness`, `test-results/accounting` and `test-results/finance-settings`.

## Operational limits

The dedicated server encryption key must be configured before saving/revealing banking data. Automated encryption-key rotation/migration is not implemented; preserve the key and follow the setup document. Bank-format validation is not bank verification. Review is an external admin check; readiness remains advisory. No transfers or verification providers are integrated. Existing historical gaps remain explicitly unavailable, with no backfill from today's details.

## Independent follow-up verification and fixes

The follow-up review fixed a late-reveal race: blur/visibility protection previously began only after a number was displayed, so a pending response could reveal it after the window lost focus. Reveal results are now bound to a request generation, invalidated on blur, visibility change, refresh and unmount, and shown only while visible. Read requests also discard outdated responses; action submission has a synchronous duplicate-click lock. Bank editing fields and cancellation controls are disabled during a save to prevent losing edits made mid-request.

Bank errors now appear beside their fields with stable accessible labels and descriptions. Review dates are readable, actor IDs stay out of the normal screen, commercial terms use clear labels, and unavailable-storage messages avoid exposing deployment variable names. Encryption, access control, readiness advisory behavior, saved agreements and payout rules were preserved. No real key or bank record was changed.

Follow-up results: **134 unit tests passed**; **100 integration cases passed with one optional queue case skipped**, then that queue case **passed separately using disposable Redis** (101 distinct integration cases verified). All **8 combined browser cases passed**. A final targeted readiness rerun passed the additional delayed-response-after-blur and account-confirmation field-accessibility assertions. All **24 Firestore access-rule assertions passed**. Desktop readiness screenshot was inspected. Production build, worker bundles, TypeScript, targeted lint and whitespace checks passed. Test logs use `/tmp/helpkey-step8-review-*`.
