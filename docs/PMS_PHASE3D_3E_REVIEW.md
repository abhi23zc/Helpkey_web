# Phase 3D–3E review — 14 November 2026

No blocking functional defect was confirmed in the reviewed simplified workflows. This result supports continuing development and preparing a controlled rollout; it is not approval for unrestricted enablement across all partner hotels.

## Scope

Reviewed shift opening/closing, active-shift ownership, initial cash collection and later payment/refund/reversal integration, authoritative receipt reconciliation, close/payment serialization, role/hotel isolation, daily report source coverage, chronological closing, late activity, immutable reports, feature disablement/replay and print/API authorization. No product source was changed in this review.

Cash is attributed to staff shifts through existing property payment records. Opening floats do not become guest revenue. Same-shift reversals and historical corrections have distinct cash effects. Cash transactions and closing read/write the same shift state; daily review uses a hotel revision advanced with operational/financial transactions. Closed reports retain snapshots; uncovered late sources are carried into subsequent reports with separate coverage identities.

## Material limits before rollout

- Daily review scans complete bounded hotel history: at most **1,000 bookings**, **3,000 records per payment/refund collection**, **1,000 shifts**, **1,000 reports**, **1,000 billing entries per booking**, and a **700 KB report snapshot**. These are lifetime evaluation limits, not daily limits. Passing them blocks reporting rather than truncating results. A hotel may initially fit and later outgrow this implementation. Broader rollout needs a source-volume check and an aggregation/coverage follow-up for larger or growing hotels.
- Historical financial/source inconsistencies block daily close; activation does not reconstruct missing records. Check actual hotel data readiness before enabling it.
- Dates close consecutively from activation. Cash transactions require the staff member's open shift once shift accounting is activated. Disabling deployment flags does not remove that accountability requirement.
- The original opener must close a shift; access removal requires restoring authorized access. No manager takeover, reopening, cash transfer or multiple-drawer workflow is implemented, consistent with the reduced scope.
- No production index readiness, real Redis/queues, payment providers or production data behavior was verified. New history indexes and snapshot field exemptions remain source-only until a separately authorized release.

## Fresh verification

- Safe unit run: **639 passed**, 202 skipped in unconfigured emulator/external suites.
- Shift/day closing, folio, invoice, creation, checkout policy, stay-change and Today emulator regressions: **83 passed** across seven files.
- Dedicated desktop/mobile closing browser suite: **2 passed**, including keyboard use, discrepancy validation, preserved drafts, lost-response recovery across reload, manager daily close and print authorization.
- TypeScript and worker builds passed. ESLint reported **0 errors and 118 warnings**. `git diff --check` passed. A production Next build was not rerun; previous implementation build results are documented separately.

No deployment, index publication, migration, production flag change, real shift/day closing or live financial mutation was performed. Browser/emulator fixtures used disposable local hotels and accounts.

## Next step

Keep the interface at this simple scope. Prepare a hotel-specific rollout checklist covering source volumes, historical reconciliation, compatible app/workers, required indexes and staff cash procedures. Add a scalable reporting approach before promising daily closing without lifetime limits. Further product work should follow the agreed roadmap rather than expanding cashier complexity by default.
