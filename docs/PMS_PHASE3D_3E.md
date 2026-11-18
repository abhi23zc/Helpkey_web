# Phases 3D–3E: cashier shifts and daily closing

## Release controls

Cashier shifts and daily closing are available by default to authorized hotel staff. No environment variables enable or disable them; legacy `PARTNER_CASHIER_SHIFTS` and `PARTNER_DAILY_CLOSING` values are ignored. Owners/managers/cashiers retain their existing role permissions. New cash collections/returns require the acting staff member’s open shift. Opening the first shift establishes the reporting start date; existing source-readiness and reporting limits still apply.

Deploy compatible application and financial/refund workers first, then prepare the source indexes in `firestore.indexes.json`, before releasing this application version. Snapshot detail arrays/maps are exempted from unused single-field indexes; hotel/date/opener history indexes remain in source. Verify indexes and emulator/browser checks before release. Implementation does not publish indexes, deploy, enable production flags, backfill, or close real shifts/days.

## Cash accounting

The existing `propertyPayments` records remain the money ledger. New cash records have `shiftId`, signed `cashEffectPaise` and (for corrections) `correctionOfShiftId`. Existing historical receipts are never assigned a shift. Initial manual collections use the same transaction integration as later collections. UPI, card-terminal and provider payments/refunds require no cash shift.

Opening cash is exact nonnegative paise physically counted, with no booking balance or revenue effect. Expected cash equals opening cash plus net cash collections minus physical cash returned. Same-open-shift reversals subtract the collection once. Reversals of historical or closed-shift cash receipts belong to the current staff member's shift, carry zero physical-cash effect and leave the earlier summary unchanged. Corrections appear separately from cash returns. Giving money back remains the existing authorized refund operation; its receipt cap and duplicate safeguards remain authoritative.

`cashierActiveShifts` uses a SHA-256 hotel/account key. Payment transactions read the active pointer and open shift, reauthorize the payment and shift action, then write the receipt and shift projection/revision together. A close reads the same shift and verifies its projection against source receipts before saving a permanent snapshot and deleting the pointer. Payment and close races serialize or reject; no receipt can commit against a closed shift.

Owners, managers and cashiers have `shift.operate`. Only the opener may close. Owners/managers have `shift.history`; other staff can inspect only their own shifts. Removal of access does not transfer the drawer: restore the opener's authorized access so that person can close. Count differences require explanations and create no financial entry. `cashierShiftRequests` retains actor/hotel-bound fingerprints and exact request receipts. Replay reauthorizes before returning the original result and does not require a new open shift.

## Dates and daily reports

The first opened shift atomically records `hotelClosingState.reportingStart`, its timezone and activation timestamp. Report dates use this hotel calendar timezone, frozen at activation, with no business-day offset. If the configured hotel timezone changes, new shifts and daily reviews require restoration of the recorded reporting timezone, preventing silent re-dating of coverage. Existing shifts can still close in their recorded timezone. Dates before activation and future dates are unsupported. Dates close consecutively from reporting start; one SHA-256 hotel/date identity makes reports unique. Today can close before midnight and operations continue afterward.

The daily review has separate sections:

- Source-dated activity from existing property receipts, confirmed provider receipts and processed provider refunds, grouped by payment method and reservation versus supplemental-service ownership. Property and provider receipt dates use their immutable source timestamps; refund returns use `processedAt`. Refund requests remain outstanding work, not completed returns.
- Shift opening/expected/count summaries, crossing-midnight shifts and closing-date discrepancies. These are not added to revenue or payment totals.
- Current authoritative folio reservation and separate-service balances, Today arrival/overdue/request predicates, pending refunds and open shifts. These are review-time snapshots, including when reviewing an earlier date, and must never be summed across reports.

Financial reconciliation errors, missing/invalid source dates or amounts, missing booking sources and open shifts begun on/before the selected date block closing. Unattributed reliable receipts remain labelled. Historical cash reversals lacking a trustworthy cash effect block reporting rather than inventing cash movement. Outstanding financial/operational work otherwise requires explicit acknowledgement. Closing performs no payment, refund, invoice, checkout, no-show or nightly-charge action.

Every authoritative `todayTransaction` mutation advances `hotelClosingState.revision` in its Firestore commit. This includes manual creation, cash/noncash payment changes, provider captures/refund completion, folio and stay/operational changes. Daily closing reads that revision and all reviewed facts in its transaction, recomputes the version and rejects a changed review. Post-commit hotel cache invalidation remains outside retried callbacks. UI changes invalidate only the selected hotel's queries and preserve unrelated drafts.

A daily report never changes after creation. Print views reauthorize each request and say “Information available when closed at …”. `dailyClosingRequests` stores exact fingerprints/results for replay, including after feature disablement. New activity remains possible after reporting. Reports retain covered source identities, with a distinct processed-refund stage identity. Shift opening and closing events have separate coverage identities as well, so floats and discrepancies recorded after a day was closed appear once as separately labelled late shift activity, never as revenue. A later report includes uncovered earlier source-dated items once under “Late activity for previously closed dates”, preserving their original dates. Captures and later completed refunds have separate coverage identities.

## Bounded evaluation and UI

History pages contain 20 rows; source and report detail pages contain at most 50 rows per section. Histories sort newest first with document-ID tie-breaks and hotel-bound cursors. New cash activity is capped at 1,000 sources per shift, leaving that shift closable at the cap. Immutable shift snapshots retain source IDs, opener/closer names and IDs, timestamps, count, expected amount, reviewed revision and discrepancy reason.

This initial reporting implementation deliberately performs a complete bounded hotel-source review: at most 1,000 bookings, 1,000 billing entries per booking, 3,000 rows per payment/refund collection, 1,000 shifts, 1,000 reports and a 700 KB report payload. Exceeding any limit produces “Review unavailable” and blocks report creation. These are evaluation ceilings, not truncation/zero defaults. Larger hotels require a separately reviewed indexed aggregation/coverage implementation before enabling daily closing; no historical reconstruction or automatic backfill is included. Missing indexes/failed source loads also cannot produce zero summaries.

Forms keep counts, reasons, notes and acknowledgements when validation or review changes. The first edit binds the submitted review version; a stale submission refreshes review without clearing those drafts. Requests persist their exact payload/key under account/hotel/workflow-scoped local storage before sending. Once uncertain, a later validation/authorization/network error cannot unlock the request. Reload restores exact retry. Storage failures prevent sending a new mutation. Saved shift/day HTML print endpoints authorize separately and render escaped immutable content.

## Local verification

Run `tests/closing.test.ts`, `tests/closing.emulator.test.ts`, and `tests/today-cache.test.ts`, followed by payment/folio/invoice/checkout-policy/stay-change regressions. Emulator tests accept only explicit localhost hosts and remove their disposable hotel/account/source records. Providers are disabled or mocked.

`FIRESTORE_EMULATOR_HOST=127.0.0.1:8092 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npx playwright test --config playwright.pms-closing.config.ts` exercises desktop/mobile with a Los Angeles device timezone, keyboard submission, discrepancy validation/draft retention, lost-response recovery after reload, manager acknowledgement and print authorization. Run TypeScript, lint, production build, worker build and `git diff --check` before release.
