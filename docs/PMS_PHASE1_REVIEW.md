# Phase 1 implementation review

Reviewed 13 November 2026 against web commit `fab619f` and the current working copies. This document records the original review; the findings below were subsequently corrected in this chat. See the resolution at the end.

## Verdict

The main Phase 1 functionality is implemented: membership-based hotel discovery, fixed staff permissions, email-bound invitations, role changes/revocation, property activation/setup, admin restrictions, restricted department views, private account boundaries and voluntary marketplace pause.

Complete a Phase 1 correction pass before broad rollout or Phase 2. Two high-priority regressions affect normal operation; a cashier lookup limitation also needs correction before daily hotel use.

## Findings

### 1. [P1] Returning to a tab destroys the same user's unfinished work

Source: `components/auth/auth-provider.tsx:68`.

The visibility/pageshow handler calls `sync()`, which unconditionally calls `resetPrivate()`, clears browser drafts and queries, clears the current app user and increments the generation. The provider renders its children under a key containing that generation. Therefore returning to a tab remounts the screen even if `/api/auth/me` returns the same account.

Manual booking and checkout store unfinished fields in component state. A receptionist switching tabs to check an email/reference can lose the open booking form. A guest leaving checkout to inspect a payment app/email can lose screen state. The generated invitation link is also component-local, so switching away to share it can remove it from the page. This source-level behavior was traced; a browser/payment-provider reproduction was not run in this review. It does not establish that a duplicate payment occurs.

Correction: revalidate identity on foreground without resetting same-account forms. Immediately clear/hide private information on an actual logout/account change, and preserve the existing cross-tab protections. Define safe behavior for failed identity checks without treating every ordinary tab return as a new account.

Acceptance: an unfinished manual reservation, guest checkout and generated invitation link survive switching away/back with the same account. A genuine account switch still clears previous private state and rejects late results.

### 2. [P1] Historical growth disables normal PMS operations

Sources: `lib/partner/pms/setup.ts:27`, `lib/partner/pms/setup.ts:102`, `lib/partner/pms/access.ts:80`.

Setup reads up to 2,001 property documents from each of eight collections, including all bookings/holds/calendars without a current-work filter. Any collection exceeding 2,000 makes inventory integrity false. `operationalAccess()` requires all setup checks to pass for activated hotels, including for ordinary lifecycle, collection and housekeeping operations.

A scratch reproduction invoking the actual setup function with mocked Firestore and an otherwise-valid hotel produced:

| Completed historical bookings | Readiness |
|---|---|
| 2,000 | ready |
| 2,001 | setup; inventory check fails |

The fixture used completed/released historical bookings and mocked unrelated pricing/access dependencies. This is a focused readiness reproduction, not a Firestore integration test.

The same full scan is repeated in routine requests and operational transactions; some commands call operational access multiple times. The partner shell also calculates setup for every activated assigned hotel, and the client polls the shell every 15 seconds. This expands reads/latency and transaction contention with hotel history and staff activity. No cost/latency load measurements were performed here.

Correction: separate initial setup/full reconciliation from lightweight runtime access and command-specific safety checks. Keep authorization and affected inventory/payment checks authoritative inside each transaction. Evaluate relevant active commitments or run paginated/background reconciliation with a visible last result; do not allow an all-history scan limit to shut down ordinary hotel operations. Do not simply remove financial or inventory protections to improve speed.

Acceptance: a hotel with more than 2,000 historical bookings/calendars remains usable; current inconsistency is still detected and shown; unrelated booking activity does not force a whole-property reconciliation transaction for each housekeeping/payment action. Verify actual reads and latency with representative data and two staff sessions.

### 3. [P2] Cashiers cannot find an older outstanding reservation

Source: `app/api/partner/properties/[propertyId]/pms/department/route.ts:22`.

Cashier lookup reads only the latest 50 bookings by creation time and applies the search afterward. An exact reference for an older active/long-stay reservation cannot be found once 50 newer bookings exist. The limitation is disclosed, but this prevents a normal payment workflow for the cashier role, which lacks the full reservation register.

Correction: add property-authorized exact reference/ID lookup and a paginated actionable balance list, preserving the cashier's restricted response fields. Explain empty versus unavailable results. Avoid fetching all guest records into the client.

Acceptance: a cashier can locate and collect against an older eligible booking by its reference, while foreign-property references and unauthorized details remain inaccessible.

## Validation in this review

- Fresh web suite: 65 files passed, 11 skipped; 538 tests passed, 108 skipped.
- Fresh web TypeScript with incremental disabled: passed.
- Web and mobile whitespace checks: passed.
- Readiness threshold reproduction described above: confirmed.
- Inspected current invitation/access/setup/department services, central partner-route authorization, changed booking/room command checks, account boundaries, UI controls and relevant unit/emulator/browser test sources.

No Auth/Firestore emulator services were listening at the documented local ports during this review. Emulator and Playwright suites, production build, native mobile and live providers/deployment were not rerun. `PMS_PHASE1.md` records earlier implementation verification; those are historical results, not fresh results from this review. Existing mobile edits were preserved.

Add regression coverage for the three findings. Existing unit checks and happy-path emulator/browser scenarios do not cover these cases sufficiently.

## Next delivery order

1. Correct the same-account foreground reset, history-dependent readiness gate and cashier lookup; verify the acceptance cases above and existing access/revocation tests.
2. Validate deployment indexes, operational feature switches and rebuilt workers in staging; the implementation notes explicitly do not claim deployment was performed.
3. Begin Phase 2 as small complete workflows:
   - 2A: staff arrival policy/property-local dates and guest-versus-operator identity, preserving current customer behavior and manual-booking access protections.
   - 2B: faster manual booking with source, partial advance and ready-room selection, including retry-safe submission and explicit check-in.
   - 2C: Today/front-desk landing and consistent reservation workspace with Guests, Room/stay, Billing summary, Requests and Activity.
   - 2D: configurable server-enforced readiness/financial policies, manager reasons, shared refresh behavior and cross-device verification.

Phase 2 exit: staff create an evening walk-in, identify the real guests, assign a ready room, record an advance, check in/out and hand over housekeeping; the second staff session and customer account show the correct saved outcome. Folio posting, invoice issuance, in-house extensions/moves and night audit retain their later-phase scope.

## Resolution

All three findings were addressed after this review: same-account foreground checks retain mounted forms/drafts while verifying identity; readiness uses live configuration and a server-only setup verification checkpoint with an explicit paginated inventory audit; cashier lookup searches exact references/IDs across hotel history and offers signed balance pagination. The initial 2,000-record history cutoff is removed. Account transitions and transactional financial/inventory safeguards remain enforced. Existing activated hotels require an owner to run Verify inventory once after deploying the additive checkpoint/index changes. Updated behavior and deployment requirements are in `PMS_PHASE1.md` and `HELPKEY_DATABASE_SPEC.md`.
