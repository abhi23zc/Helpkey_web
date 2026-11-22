# Phase 3: property accounts, deductions and payout estimates

## Activation and boundaries

Accounting is off when `financeConfiguration/accounting.enabled` is absent or false. An active Admin enables it in **Admin → Finance → Accounting activation** with a reason and expected configuration revision. This setting applies to every newly created booking, including manual reservations and walk-ins. The source transaction saves an immutable `accounting` marker with inclusion, version, setting revision and timestamp.

Existing bookings without the marker remain excluded, including later services, captures and amendments. Bookings created while disabled receive an explicit excluded marker. Disabling the setting later does not stop accounting for included bookings. Do not migrate historical bookings or edit their markers.

Payout transfers, founder approval execution, tax remittance, booking restrictions, deployment and historical migration are outside this implementation. Every estimate states **Awaiting founder approval** and has `executionEnabled: false`. Dues cause warnings only.

## Posting and source transactions

`lib/background/commit.ts` invokes the finance transaction adapter before committing transaction writes. `lib/finance/transaction.ts` buffers source and finance mutations, forwards all reads to the same SDK transaction, prepares accounting from the source records and staged object patches, then flushes writes. Background delivery still runs after a successful commit. The SDK and provider interfaces are not patched; provider HTTP requests remain outside transactions.

The adapter integrates accepted original/service/bundled agreements, linked reductions, payment attempts, property collections and reversals, refund reservations/completions, checkout, cancellation/no-show and timed service recognition. Existing reservation, payment identity, inventory, lease and authorization checks remain in their handlers. Unknown source transforms fail closed rather than guessing financial values. Source financial writes must use object patches and transactions.

New agreement snapshots save waiting periods, canonical participant identity and applicable published rule references. Obligations debit customer receivables and credit hotel entitlement or HelpKey revenue; they do not claim a collection. Receipts persist oldest-accepted-agreement allocations in saved line order. Supplemental/bundled receipts use their saved request allocation references. Customer fees stay outside hotel entitlement. Late/duplicate captures debit actual cash with a matching refund obligation and have no eligible hotel allocations.

Journals under `financeAccounts/{propertyId}/journals` are balanced INR entries with integer paise, event identity, payload fingerprint, source reference, actor, dates, agreement/line/allocation references and assessment/reversal references where applicable. Identical event retries return the existing journal; conflicting key reuse fails. Corrections create linked counterentries; capture/refund cash cannot be reversed through an Admin accounting command.

The account projection and revisions commit atomically with journals. Replay follows sequential journal revisions. A separate account revision covers changes to allocation/readiness state and commands. Transaction retries start with fresh buffered writes. Recovery sweeps with no financial changes leave account revisions unchanged.

## Reviewed deductions

Rules are immutable versions with draft → reviewed → published lifecycle. They include a legal reference, category, event, base, fixed/percentage calculation, rounding, applicability, effective dates, participant, threshold period/scope/treatment and saved correction treatment. Production values must be supplied and reviewed; this repository does not supply production legal rates.

Different applicable deduction rules are assessed separately. Conflicting applicable versions of one rule stay pending. Rules can use taxable, gross or saved commission bases. Explicit reviewed “not applicable” outcomes are complete assessments, not implicit zeros. Missing rules, ambiguous versions or missing participant identity keep affected funds held.

Ordinary accommodation commission uses saved amounts net of linked commission reversals and is recognized at actual completed checkout even if the customer still owes money. Services use saved fulfilment independently of online collection. Cancellation/no-show commission uses only finalized retained collected room taxable value.

Counters use canonical participant identity, reviewed rule version, configured timezone/period and optional property scope. Counter changes, child assessments, journal entries and account projections share a transaction. Cross-property aggregation never authorizes cross-property balance offsets. Saved before/after values and correction history allow audit without recalculating unrelated assessments. A whole-base threshold catches up the cumulative qualifying base on crossing; excess thresholds assess the newly qualifying excess. Corrections follow the saved rule and update only the affected assessment/counter.

The Admin preview action uses the same pure calculation without posting or updating counters. A founder can explicitly attach a published applicable version to a pending assessment with a reason. Publishing does not rewrite accepted agreements.

Synthetic drafts can be created using `npm run finance:fixtures:accounts -- <development-admin-uid>`. This requires a loopback emulator or a non-production `helpkey-dev-*` project. The examples are zero-deduction synthetic outcomes for the `example` jurisdiction and have no legal authority. The command neither publishes them nor activates accounting. Synthetic configuration is rejected outside guarded environments, including during recognition and publication.

## Reviews, holds, receipts and eligibility

Cancellation/no-show funds remain held until the founder provides retained taxable/tax values, refund amounts, collection sources (including explicit mixed-source shares), tax treatment and an explanation for every saved line. Validation checks the saved collection/refund outcome, components, prior reductions and available funds. Uncollected waived obligations are released without claiming cash. Financial resolution time is recorded. Cancellation eligibility waits from the later of scheduled checkout and resolution.

Provider fees require an actual capture, evidence, reason, unique source and an amount no larger than captured money. The fee is allocated over saved capture allocations; hotel-paid portions become hotel charges and HelpKey-paid portions become provider expense. A confirmed zero fee still needs evidence. Unknown hotel-paid fees hold the relevant allocations. Reversing a fee creates counterentries and restores its unresolved state until corrected.

Verified hotel receipts settle oldest outstanding dues. Excess is separately visible hotel credit, not booking revenue. Credit created by correcting an already settled charge is also kept visible. Receipt references are unique. Receipt reversals restore dues/credit through linked counterentries. Audited holds name an amount, responsible Admin, reason and release condition. Overlapping reasons remain visible without counting the same held funds multiple times.

Eligibility excludes customer unpaid amounts, HelpKey customer fees, refund reservations, unresolved assessments/fees, disputes and unfulfilled agreements. Stay waiting begins at actual checkout; separate services use saved fulfilment. Current profile details, supporting-document ownership/deletion/rejection, manual review and current agreement acceptance are revalidated. Readiness failures block estimates while preserving statements.

Refund reservations take priority over internal offsets: if newly reserved customer money had already been offset, linked offset-release records restore the hotel dues and reserve those funds. Internal offsets use oldest eligible allocations to settle only that property's dues. Offset records include charge references and explicitly declare `bankTransfer: false`. The approved current schedule and minimum payout determine preparation estimates; timezone/DST boundaries are handled in local schedule calculations.

## Storage and APIs

- `financeAccounts/{propertyId}`: account projection, source/account revisions.
- `bookings`, `assessments`, `holds`, `retentionQueue`, `offsets`, `feeSources`, `receiptReferences`, `commands` beneath each account: private account support records.
- `financeDeductionRules`: immutable rule content and audited lifecycle metadata.
- `financeAssessmentCounters`: shared participant/period counters.
- `financeConfiguration/deductions`, `/accounting`, `/recovery`: published references, activation and durable sweep checkpoint.

Admin GET `/api/admin/finance/accounts?propertyId=...` and `/api/admin/finance/accounts/transactions?propertyId=...` return the account and cursor-paginated journal history. POST `/api/admin/finance/accounts/commands?propertyId=...` accepts the reviewed command forms.

Admin GET `/api/admin/finance/deductions` and POST `/api/admin/finance/deductions/commands` manage activation, rule drafts/review/publication and preview. Mutations require a mutation ID, expected revision, reason and relevant references. Reused IDs with changed payloads fail; retries recheck live permissions.

Owners use GET `/api/partner/properties/{propertyId}/finance/account` and `/account/transactions`. Both partner middleware and transaction-time finance access checks apply. Customers and cross-property users are denied. Owner transactions omit private journal lines; customer booking DTOs contain no new accounting fields or internal assessments. There are no Expo feature changes.

Responses include contract version 3, account revision, calculation time, balances, assessment completeness, holds and schedule estimate. Statement cursors bind property and journal revision; stale statements require a reload. Forms retain independent drafts and explicitly rebase on the refreshed revision after conflict.

## Recovery and reconciliation

The existing shared recovery worker pages included bookings using a durable Firestore checkpoint and invokes the same transaction integration for due services and pending saved-rule assessments. A crash replays safely. Accounting deactivation does not disable this sweep. Current holds/readiness are also checked before offsets.

`npm run finance:reconcile -- <propertyId>` takes a consistent read-only transaction. It compares journal sequencing/fingerprints/replay with projections, source booking markers, saved agreements/reductions, receipt allocations and shared counters. It reports discrepancies with references, exits nonzero for discrepancies, and never repairs or resets records.

The CLI uses `tsconfig.finance-cli.json` for Node's server-only marker mapping. Worker bundles use an explicit Node-only marker alias. Before production activation, the normal infrastructure release must supply the collection-group assessment-counter index from `firestore.indexes.json`, reviewed legal rules, complete profiles/documents/acceptance and running recovery workers. No infrastructure deployment is performed by this change.

Validation evidence and coverage boundaries are recorded in `FINANCE_PHASE3_VALIDATION.md`.
