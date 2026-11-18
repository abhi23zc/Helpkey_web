# Phase 3D–3E local verification

Verified on 2026-11-14 using disposable localhost emulator records and disabled/mocked providers. No production records, shifts, closings, flags, deployments or published indexes were changed.

- Compatible full Vitest regression: **816 passed, 21 skipped**, 95 files passed. Dedicated guest-history tests ran separately on their required isolated localhost:8293 emulator: **2 passed**.
- Final closing/accounting/cache suite: **17 passed**. Covers permissions, hotel scope, competing opens, cash/noncash separation, same-shift and historical reversals, actual returns, source-projection corruption, immutable snapshots, count reasons, stale reviews, closure/payment races, midnight/cross-midnight dates, report uniqueness, acknowledgements, late payment and late shift coverage, subsequent activity and recovery after flag disablement.
- Initial-collection and creation regression suite: **10 passed**, including cash advance linkage in the creation transaction and exact creation recovery after the original shift closes. A combined closing/creation race run passed **18 tests**.
- Desktop/mobile Playwright: **2 passed** using America/Los_Angeles device time against Asia/Kolkata hotels. Covers keyboard opening, preserved count/reason/note validation, lost committed-response recovery after reload, cashier/manager permissions, immutable report printing and denied cashier access to manager reports.
- Desktop/mobile layouts and the print-media daily report were visually inspected. Print tables show separate money activity, shift accounting and outstanding snapshots.
- TypeScript passed. Focused lint passed without warnings/errors; the earlier full lint run had no errors and existing repository warnings.
- Webpack production build and worker builds passed. The default Turbopack build was attempted but hit an environment port-binding error (`Operation not permitted`); the production webpack build is the verified alternative.
- Whitespace checks passed. Composite history indexes and snapshot-field index exemptions were added to source only.

Full regression command:

```sh
FIREBASE_ADMIN_PROJECT_ID=demo-helpkey-pms FIRESTORE_EMULATOR_HOST=127.0.0.1:8092 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm test -- --maxWorkers=2 --testTimeout=30000 --hookTimeout=30000 --exclude tests/booking-guest-details.emulator.test.ts
```

The full run preceded the final extra cross-midnight/initial-cash cases; those additions and the final closing changes passed in the focused runs above. Counts from overlapping runs are not additive. Integration suites requiring additional unavailable services remain skipped, as in prior phases.

Release controls and the bounded complete-source reporting ceilings are documented in [PMS_PHASE3D_3E.md](PMS_PHASE3D_3E.md). Daily closing remains off by default and requires shift accounting. Larger hotels exceeding those ceilings receive an unavailable review and need a separately reviewed aggregation/coverage extension before enablement.

## Default availability update — 15 November 2026

Cashier shifts and daily closing no longer depend on environment feature switches. Legacy `PARTNER_CASHIER_SHIFTS` and `PARTNER_DAILY_CLOSING` values are ignored, including `false`. Role permissions, hotel isolation, first-shift reporting activation and financial/source limits remain enforced. New hotel cash collections/returns require the acting staff member’s open shift.

Verification: **642 unit tests passed** (202 emulator/external tests skipped in that run); **12 closing/cache tests passed** on isolated localhost emulators; **2 desktop/mobile browser scenarios passed** with both legacy switches explicitly `false`. TypeScript, focused ESLint, worker builds and whitespace checks passed. No production records were mutated and no application deployment was performed. Earlier references to disabling these deployment flags describe the previous implementation, not current availability.
