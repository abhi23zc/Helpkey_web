# Phase 2D review — 14 November 2026

Core operational policy enforcement is connected and passed the isolated transaction/browser checks. Defaults remain off, owner settings use revisions/history, lifecycle commands enforce current policy facts transactionally, and keyed retries preserve original lifecycle effects. Two consistency/performance issues should be resolved before Phase 3.

## Resolved [P2]: shared action eligibility contradicted existing command restrictions

`lib/partner/reservations/eligibility.ts:54-55` marks collection available based on lifecycle state and permission only, and amendment available for both confirmed and checked-in reservations. Actual commands retain stricter existing rules: collection refuses pending refunds; amendments require future confirmed interval-inventory bookings and exclude unresolved extras/discount/refund agreements.

Reproduced with an isolated checked-in reservation carrying a pending refund: shared eligibility returns collect.allowed=true and amend.allowed=true, while performOperation returns COLLECTION_NOT_ALLOWED and previewAmendment returns AMENDMENT_NOT_ALLOWED. Server protection holds, but the advertised availability/blocker contract is incomplete. Align shared predicates and blocker reasons with the authoritative existing commands; do not introduce new operational policy settings to address these existing restrictions.

## Resolved [P2]: Today multiplied whole-hotel eligibility reads per displayed booking

`lib/partner/today/service.ts:72-74` invokes loadEligibilityFacts independently for every row. With an assignment/cleaning policy enabled and an assigned room, each invocation queries all active maintenance blocks and all checked-in reservations for the hotel, plus unit/calendar reads. These additional queries are unbounded and bypass the bounded summary/cache benefit.

A controlled read-count probe for 50 displayed assigned reservations and 100 checked-in occupants issued 50 occupancy queries and 50 maintenance queries and processed 5,000 occupant records before other reads. This is a mock-based amplification demonstration, not a production cost measurement. Share bounded, request-local room/occupancy/maintenance dependencies for read-only page eligibility and batch booking/unit/calendar reads where practical. Keep write-time policy enforcement inside the authoritative transaction; do not reuse stale advisory facts for writes.

## Verification performed

- Non-emulator web unit suite: 581 passed; 150 environment-dependent cases skipped.
- Standalone TypeScript passed.
- Policy, Today and customer booking/payment emulator suites: 54 passed (17 policy cases, 5 Today cases, 32 existing customer booking/payment cases).
- Existing PMS transaction/domain regressions: 76 passed.
- Real Next.js desktop/mobile Today, notification and policy/lifecycle browser suite: 10 passed.
- Additional isolated consistency probe confirmed collection and amendment mismatches; a controlled unit probe confirmed repeated eligibility reads. Temporary probe source files were removed.

Local tests used disposable Firebase emulator records; Redis was disabled for the policy/customer transaction run. The current review does not repeat real Redis/provider integration or production deployment validation. No product source, indexes, production policies or live records were modified.

After fixing the two findings, Phase 3 is the agreed folio/billing and in-house stay-management milestone. Define ledger/service-payment reconciliation and invoice requirements before implementation; retain later night-audit/channel integrations as separate work.

## Resolution (14 November 2026)

- Collection, assignment and amendment now use the same pure restrictions for read eligibility and actual commands. Existing amount/reference/chosen-rate validation stays in the authoritative command. The payment UI uses server eligibility and retains drafts while blocking invalid collection.
- Today batches its current booking reads and builds a request-local room context. It queries projected occupancy and maintenance once each, deduplicates unit/calendar references, and reads documents in 200-reference batches. Explicit limits prevent partial eligibility. Policy-off and non-confirmed rows skip check-in room reads. No new cached cross-account facts were introduced.
- Authoritative writes never accept the advisory context. A real emulator test verifies identical advisory/transaction facts, then changes room condition and confirms both stale-version rejection and fresh policy rejection.
- The read-count regression verifies that 50 assigned rows share one occupancy and one maintenance query instead of 50 of each, plus deduplicated unit/calendar reads. Separate tests cover bounds, hotel isolation, permitted cases, existing amendment/refund restrictions and permission/feature precedence.
- A new browser check also identified a collapsed payment-section deep link; the workspace now opens the destination disclosure before scrolling/focusing it.

No production deployment, live-data mutation or hotel-policy change was performed. No new indexes or migration are required.

Post-fix verification: 605 web unit tests passed (152 environment-dependent tests skipped); 19 policy, 5 Today and 32 customer booking/payment emulator cases passed; 76 existing PMS cases passed; all 12 desktop/mobile Today/notification/policy/payment-control browser cases passed. TypeScript, worker bundles and whitespace checks passed. ESLint reports zero errors and 97 retained warnings. Emulator verification used disposable local records; policy suites ran with Redis disabled, while cache-specific Today checks retained their existing in-memory Redis test double.
