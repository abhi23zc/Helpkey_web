# Phase 2D: Authoritative hotel operational policies

## Configuration and defaults

Settings → PMS setup → Operational policies exposes four independent optional booleans in properties.pms.operationalPolicies:

| Field | Enforced action |
| --- | --- |
| requireAssignedRoom | Check-in requires a valid assigned physical room |
| requireCleanRoom | Check-in requires an assigned clean or inspected room |
| requireGuestRegistration | Check-in requires saved names for all staying adults, children and infants |
| requireSettledBalance | Checkout requires the reservation balance to be settled |

All missing fields resolve to false. Existing reservations use the current hotel settings at action time. Enabling a policy affects subsequent actions on existing active stays immediately; it neither rewrites history nor introduces setup checklist requirements. Clean-room enforcement requires assignment even if the separate assignment setting is off. The UI explains this dependency and never changes another checkbox automatically.

Only setup.manage can save policies (the existing fixed owner role). Saves require the current policy revision, increment it, record updater/server timestamp and append before/after booleans and revision to pmsEvents. POLICY_REVISION_CONFLICT returns 409. Settings retain their draft and captured revision until an explicit reload; background data cannot replace the draft.

## Shared evaluation and authoritative enforcement

The shared reservationEligibility evaluator consumes server-loaded facts. Every action has allowed, blockers, reason (first blocker message or null), and an opaque SHA-256 eligibilityVersion. Blockers carry stable code, category, message and an authorized resolution destination or null. Categories are permission, restriction, state, policy and stale. Permission-denied results contain no registration counts, balance amounts or policy blockers. Balance amounts appear only with payment.read. Destination permissions are evaluated per caller, after authorization.

Check-in/out, partner cancellation and no-show recheck permission, membership/account/hotel restrictions, activation/readiness, lifecycle/time and current facts inside the authoritative transaction. Read all dependencies before writing. Assignment/cleaning enforcement reads the unit, physical calendars over the stay/turnover, current checked-in occupancy, and active maintenance. These reads participate in Firestore transaction serialization/retries. Missing/inactive/wrong-hotel/wrong-type rooms fail; dirty and unknown are not clean. Clean and inspected pass. Policies off preserve advisory behavior.

| Policy blocker | Resolution, if authorized |
| --- | --- |
| ASSIGNED_ROOM_REQUIRED | Assignment |
| ROOM_OCCUPIED | Assignment |
| ROOM_MAINTENANCE_RESTRICTED | Assignment |
| CLEAN_ROOM_REQUIRED | Housekeeping in Rooms |
| GUEST_REGISTRATION_REQUIRED | Guests |
| HISTORICAL_REGISTRATION_REVIEW_REQUIRED | Owner Settings |
| RESERVATION_BALANCE_DUE | Payments |

No force action or bypass exists. Resolution text names reception, housekeeping, cashier or owner when the caller cannot resolve the blocker. The server remains authoritative even when clients omit the optional eligibility version.

## Registration and financial scope

Registration evaluates saved names by age group, never only registrationIncomplete. It does not require documents, verification, pre-check-in answers or a linked account. Phase 2A reservations use canonical occupants. Existing customer bookings can use original saved adultGuestNames and explicitly edit all age groups in the same registration editor. Such edits save occupants and registrationVersion: 1 with existing revision/audit history; ownership, contact details, customer links and identityVersion remain intact. No contact matching, inferred association or staff-as-guest conversion occurs. The invitation editor remains limited to eligible Phase 2A manual bookings.

Historical manual bookings without identityVersion 2 cannot establish authoritative identities. They return HISTORICAL_REGISTRATION_REVIEW_REQUIRED. There is no historical correction workflow in this phase; the owner controls the hotel's registration policy.

The balance setting is labelled “Require the reservation balance to be settled before checkout.” stayFinancials(...).balanceDuePaise is its sole authority. This covers charges already bundled into the booking total, existing credits, received money, refunds and reserved refunds. Pending online captures do not count as received. Separately accounted service payments remain excluded. No new ledger, payment allocation, write-off or financial migration is added.

## Request, error and retry contracts

POST /api/partner/bookings/{id}/status retains existing statuses and the completed compatibility alias. Optional expectedEligibilityVersion rejects changed facts with ELIGIBILITY_CHANGED (409), including current blockers. The version hashes booking/current policy/relevant room facts and agreed-time boundary states, rather than a moving clock value.

Optional idempotencyKey, or Idempotency-Key header, is scoped to booking and actor. Deterministic lifecycleReceipts and events recover successful exact-key requests. Replays reauthorize before returning and do not change original lifecycle timestamps, notifications, physical housekeeping or refund effects. Reusing a successful key for a different action returns IDEMPOTENCY_CONFLICT (409).

API errors use the existing error envelope and ApiClientError infrastructure, with optional error.eligibility. Permission/hotel restrictions return 403, stale/state conflicts 409, unmet operational policies 422. Unauthorized requests receive generic permission errors rather than sensitive blockers.

The workspace captures the reviewed version and key when opening confirmation. Background refresh leaves that pending request unchanged. Transport failures retry the same request/key for lost-response recovery. A semantic 403/409/422 closes confirmation, refreshes current facts and requires a new explicit review before a changed request. Registration and settings drafts retain their captured revision and inputs until explicit reload.

## Today and invalidation

Today continues to cache only hotel-scoped caller-independent summary facts. Page-level action eligibility batch-loads current bookings and shares fresh room/occupancy/maintenance dependencies within one authorized request, for at most 50 displayed rows. It is never cached for another staff member. Unique unit/calendar documents are read in batches of at most 200; occupancy and maintenance each use one bounded projected query per page (10,000 occupants and 1,000 blocks maximum). Exceeding a bound returns an explicit unavailable error, never partial facts. This avoids adding private registration fields to the shared cached projections. Checkout-only rows do not load check-in room dependencies. Full workspace GET uses the same bounded read builder; lifecycle writes independently re-read dependencies inside their own Firestore transaction.

Policy saves use the existing todayTransaction post-commit hotel invalidation boundary. Assignment, housekeeping, registration, collections, reversals, refunds and lifecycle mutations retain Phase 2C invalidation behavior. Client operational-data-changed events and foreground polling refresh other sessions without replacing drafts or pending requests. Existing hotel cache isolation and Redis failure behavior remain unchanged.

## Local verification and release

Verification uses only disposable demo-helpkey-pms records on localhost Firestore/Auth emulators. The policy emulator suite also runs with the server cache enabled against an isolated Redis key namespace. See the implementation report for actual test totals; no claim is made that every possible interleaving or external provider state has been exercised.

No historical migration, automatic activation or new index is required. Preserve Phase 2B/2C work and declared indexes. Release requires the updated application and rebuilt/restarted worker bundles because shared booking/access modules changed. Nothing in implementation deploys the app, publishes indexes, changes live hotel policy or mutates production records.

### Verification results from this implementation

- Broad Vitest run: 708 tests passed. The customer-history suite initially stopped at its explicit requirement for a separate Firestore instance on localhost:8293; both of its tests passed after starting that isolated emulator. Combined result: 710 passing tests; 21 external Razorpay/background/queue integration tests were skipped. The initial port-guard failure was configuration, not suppressed or changed test code.
- Final focused checks after registration/contact hardening: 36 passing policy/unit/walk-in emulator tests, including 17 policy transaction cases with server caching enabled and isolated localhost Redis keys.
- Browser suites: Today 10, creation 6, walk-in 8 and PMS foundation 13 passed (37 cases). Today/creation/walk-in run on desktop and mobile with a different device timezone. The two policy browser cases were additionally rerun with an aborted response after server commit, foreground refresh and exact-key UI recovery; both passed.
- TypeScript passed. ESLint completed with zero errors and 97 existing warnings. Production `next build --webpack`, all worker bundles and `git diff --check` passed. Added files were also checked for trailing whitespace.
- These runs do not verify live provider integrations, every possible transaction interleaving, production rollout or production indexes. No deployment, index publication, live policy activation or production record mutation was performed.

### Post-review corrections (14 November 2026)

Collection, assignment and amendment availability now share pure restriction functions with the authoritative commands. Pending refunds and settled balances block new collection; invalid lifecycle/time/inventory states and unresolved extra/discount/refund agreements block amendment. Existing permissions, feature gates, request-specific amount/reference/rate validation and error codes remain authoritative. Inapplicable lifecycle actions report their state conflict rather than irrelevant room-policy explanations.

The reservation payment form consumes server collection eligibility, disables blocked collection/review/confirmation and displays its reason while retaining drafts. Payment-section deep links open the containing disclosure so users can see the destination. Refund/reversal controls retain their existing behavior. No new hotel policy, persisted field, migration or index is introduced.

Post-fix verification: 605 web unit tests passed (152 environment-dependent tests skipped); 19 policy, 5 Today and 32 customer booking/payment emulator cases passed; 76 existing PMS cases passed; all 12 desktop/mobile Today/notification/policy/payment-control browser cases passed. TypeScript, worker bundles and whitespace checks passed. ESLint reports zero errors and 97 retained warnings. Emulator verification used disposable local records; policy suites ran with Redis disabled, while cache-specific Today checks retained their existing in-memory Redis test double.
