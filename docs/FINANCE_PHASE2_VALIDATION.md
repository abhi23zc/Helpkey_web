# Phase 2 verification results

## Latest follow-up validation — 21 November 2026

The reported service-balance, payment-override and transaction-fixture issues are fixed. The five mobile ref-access lint errors are also resolved. These results supersede the initial counts below for the checks rerun:

| Check | Follow-up result |
| --- | --- |
| Web / Expo TypeScript | Both pass |
| Full web unit suite | 694 passed, 221 environment-gated tests skipped |
| Full Expo Bun suite | 769 passed, 0 failed |
| Finance and stay transaction suites | 37 passed: 10 Phase 2, 9 Phase 1, all 18 existing stay cases |
| Finance browser suite | 7 passed |
| Web lint | 0 errors, 117 warnings |
| Full Expo lint | 0 errors, 22 warnings |
| Production build | Pass using `npm run build -- --webpack` |
| Worker builds | Pass |
| Diff whitespace checks | Pass in both workspaces |

New database regressions exercise accepting a hotel-collected service after fully paid accommodation, invoice and public-history totals, idempotent duplicate collections, overpayment rejection, receipt reversal, partial collection, and an Admin hotel payment override over full-online global defaults. The repaired stay fixtures use reviewed synthetic rules and authoritative quotes without relaxing production validation. The Phase 2 emulator tests now run in the PMS CI command as well.

No production data was reset or modified and no deployment or live provider test was performed. Native-device gesture behaviour was not tested; the mobile checks cover types, lint and unit tests.

## Initial validation baseline

Verified locally on 21 November 2026. No deployment, live payment, transfer, historical migration or data reset was performed. Results below distinguish pure tests, mocked HTTP/provider boundaries, and an isolated real Firestore emulator.

| Check | Actual result |
| --- | --- |
| Web TypeScript (`npm run typecheck`) | Pass |
| Expo TypeScript (`npm run typecheck` in `../app`) | Pass |
| Full web Vitest suite | **690 passed**, 219 skipped; 83 test files passed and 22 environment-gated files skipped |
| Full Expo Bun suite | **769 passed**, 0 failed across 36 files |
| Finance Firestore suites | **17 passed**: 8 Phase 2 cases plus 9 retained Phase 1 cases |
| Finance browser suite | **7 passed** |
| Selected checkout/arrival/browser regressions | **8 passed**, covering desktop/mobile option switching, desktop/mobile personalization and arrival, three checkout stages at 390/768/1366 px, empty extras, and recovery from rejected selections |
| Web lint | Pass with 117 warnings, 0 errors |
| Changed mobile source lint | Pass with 6 warnings, 0 errors |
| Whole mobile lint | **Fails with 5 existing errors and 23 warnings**; errors are in untouched search/filter screens |
| Web production build | Pass |
| All worker builds (`npm run build:workers`) | Pass, including affected booking/projection workers |
| Web/mobile `git diff --check` | Pass |
| Synthetic command without explicit guard | Refused as expected |
| Synthetic command with localhost emulator, `demo-helpkey-` project, and confirmation flag | Pass; created only synthetic rules/registry |

The five whole-mobile-lint errors are `react-hooks/refs` reports in `../app/src/app/filters.tsx` (four reports involving ref updates and PanResponder use) and `../app/src/app/search.tsx` (one render-time ref update). These files were not changed by Phase 2. They were not suppressed or rewritten as unrelated work.

## What was exercised

The calculator suite includes the synthetic exclusive ₹2,000 → ₹2,200 and inclusive ₹2,200 → taxable ₹2,000 plus ₹200 tax examples, unit/night tiers, explicit hourly rules, different service categories, exact component rounding, invalid date/coverage cases, overflow, advances on checkout extras, fixed-advance caps, gateway minimums, restrictions, direct commissions, public DTO privacy, pending deduction provenance, saved cancellation deadlines/penalties, capped component reversals and commission-rounding reversals. Existing checkout tests retain free/included and pending-request exclusions and changed-quote checks.

Firestore ran on a separate local emulator at `127.0.0.1:8096` using `demo-helpkey-` projects. Cases cover concurrent duplicate creation, stale registry quotes, inherited basis changes, committed order amounts after price changes, immutable rule publication and overlap rejection, negotiated direct bookings with deterministic dated allocation, immutable amendments with linked tax reversals and public history totals, and serialized concurrent publication. Phase 1 cases retain document revalidation, owner/staff authorization, expected revisions, acceptance, audit, and disabled-payout behavior. Test records use unique prefixes; cleanup does not reset a database.

Provider calls in payment tests are mocked. The immutable-order test asserts that retrying after a rate change reuses the committed amount and makes no duplicate order request. It does not verify live Razorpay capture, settlement, refund delivery or gateway account configuration.

Browser suites mount real React components against deterministic HTTP fixtures rather than live backend/provider services. The checkout suite verifies refreshed server-returned payment totals, selection removal after quote rejection, persisted form navigation and responsive layouts. Old assertions for renamed controls and pre-Phase-2 cancellation/advance behavior were updated to the new contracts. The entire historical browser/PMS suite was not claimed as run.

Expo tests exercise strict parsing, consent, request construction, journal/recovery and service-payment logic. They do not replace native Android/iOS device testing, SecureStore hardware behavior or a live native Razorpay flow. Native-device and live-provider validation remain unperformed.

## Reproduction commands

```sh
npm run typecheck
npx vitest run --maxWorkers=4
npm run lint
npm run build
npm run build:workers
npm run test:e2e:finance
npx playwright test --config playwright.stay.config.ts \
  --grep 'finance v2 payment|optional checkout|three checkout stages|quote failures|empty extras'
```

With an explicitly started disposable local Firestore emulator:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8096 \
FIREBASE_ADMIN_PROJECT_ID=demo-helpkey-phase2 REDIS_DISABLED=1 \
npx vitest run --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000 \
  tests/finance-calculation.emulator.test.ts tests/finance.emulator.test.ts
```

In the sibling Expo workspace:

```sh
npm run typecheck
bun test
npm run lint  # Whole-repository failures described above remain visible.
```

See `FINANCE_PHASE2.md` for contract changes, guarded fixture usage, unsupported cancellation-tax treatments, and required production legal/commercial/profile reviews. Production configuration is deliberately not supplied or activated by this implementation.
