# Phase 3A implementation review

Reviewed 14 November 2026. Both findings below have now been fixed and regression-tested. The initial review changed no product code; the subsequent fix pass updated the reconciliation model, refund controls and permanent tests.

## Resolution

- Legacy separate quoted services are included in agreed charges and excluded from the original booked-extras listing. Missing legacy allocations fall back to the existing paid quote snapshot once, with explicit source-history warnings. Canonical provider payment references prevent a capture and its allocations from being counted twice. Pending/completed service refunds remain separate from reservation money.
- Missing or mismatched service charge history suppresses a refundable-excess recommendation. Both the workspace and printable statement show **Review required** for that figure while retaining the source totals and detailed warnings.
- Hotel refund availability now follows permission and remaining hotel collection receipts, independently of the original booking payment method. Provider receipts are excluded from hotel refund/reversal selection. Exhausted receipts disappear, a stale selected receipt produces a review error, and the displayed hotel returnable excess is bounded by remaining hotel receipts. Existing server receipt caps, authorization and idempotency remain authoritative.
- Added seven domain regression cases covering legacy/current paid agreements, pending/completed refunds, missing source history, mixed-version combined captures, duplicate allocations and mismatched quotes. Added a permanent browser scenario, executed on desktop and mobile, that returns a hotel cash payment on an online-paid booking and confirms that provider money is untouched.

Final fix verification: **622 unit tests passed**, 163 externally configured tests skipped in that run; **143 billing/PMS emulator tests passed**; **6 billing browser tests passed** across desktop/mobile. TypeScript and worker bundle compilation passed. ESLint reported **0 errors and 97 existing warnings**. `git diff --check` passed. No deployment or live financial mutation was performed.

## Original findings (resolved)

### P2 — Legacy paid supplemental services can become false refundable excess

`lib/partner/billing/domain.ts:218` includes only `agreementVersion === 2` agreements when calculating supplemental service charges. Existing supported legacy records can contain an accepted, paid quote and a matching service capture/allocation without that marker. Their receipt is counted, but their charge is omitted.

A disposable domain probe used an accepted paid service of 2,000 paise with a matching capture and allocation. Existing `supplementalFinancials` returned total 2,000 and paid 2,000. The new reconciliation returned service total 0, received 2,000 and refundable excess 2,000, with no service warning. The folio and printable statement can therefore misrepresent money owed back to the guest.

Preserve the supported legacy agreement/receipt meaning, deduplicate captures and allocations, and explicitly flag ambiguous historical charges instead of presenting them as clean refundable excess. Add permanent regression cases for legacy paid, pending-refund and refunded services alongside version-two agreements.

### P2 — Mixed-payment bookings hide legitimate hotel refund controls

`components/partner/dashboard/reservation-operations.tsx:151` disables all refund controls whenever the original payment method is online/Razorpay or online captures exist. A hotel can collect cash for an additional folio charge on that same booking. When the charge is voided or credited, staff cannot record returning that cash from the workspace.

A localhost browser/API probe created an online-paid reservation, posted a 2,000-paise laundry charge, collected 2,000 paise in cash, then voided the charge. The workspace had no Refund payment button. The existing operations API successfully refunded that exact cash receipt and updated `propertyRefundedPaise` to 2,000. This confirms a UI workflow gap rather than a missing backend capability.

Determine hotel refund availability from eligible hotel collection receipts and permission/state rules. Keep provider refund handling distinct, retain receipt caps and reasons/references, and test mixed online/hotel payment bookings on desktop and mobile.

## Verification performed

- Safe unit regression: 615 passed, 163 skipped because external integrations/emulators were absent from that run.
- Targeted billing, policy, Today and booking transaction suites on isolated localhost emulators: 67 passed.
- Existing PMS regression suite on isolated localhost emulators: 76 passed.
- Existing billing browser suite: 4 passed, desktop and mobile.
- Additional temporary probes: one domain reproduction and one browser/API reproduction confirmed the findings above. Their assertions reproduced current incorrect behavior; these are not regression fixes. Temporary probe source/config files were removed after verification.
- TypeScript passed with incremental compilation disabled.
- ESLint: 0 errors, 97 warnings.
- `git diff --check` passed.

The existing checks cover immutable corrections, concurrent writes, permissions and hotel isolation, source reconciliation, stale review/print versions, retry recovery, and restricted cashier reads. Passing checks do not establish correctness for every historical record or production configuration. A fresh production build and worker bundle build were not part of this review; the implementation document records its earlier build results separately.

## Next step

Proceed to Phase 3B: property invoice configuration and a finalized invoice/credit-note workflow built on the reconciled folio. Confirm the hotel's invoice requirements before implementing issuance; keep the current itemized statement clearly distinct from a finalized tax invoice.

No deployment, index publication, production financial mutation, policy change or migration was performed. Emulator and browser writes used disposable test hotels and accounts only.
