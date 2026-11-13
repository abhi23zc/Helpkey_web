# Helpkey connectivity audit and partner PMS delivery plan

Reviewed: 13 November 2026, Asia/Kolkata.

Product direction confirmed by the owner: **offer PMS to all Helpkey partner hotels**. This replaces the own-hotel-first product assumption in `PMS_RESEARCH_AND_ROADMAP.md`. Use staged partner cohorts for validation, while designing the product for every eligible partner.

## 1. Assessment

Helpkey has a substantial booking platform and an initial hotel operations workspace. Its main gap is the connection between operational steps: a reservation, physical room, guest registration, service request, payment and checkout do not yet form a complete daily hotel workflow.

Keep the shared booking/inventory engine and current stack. Extend the partner workspace with front-desk orchestration, staff permissions, property setup and billing. A separate PMS reservation database would create competing inventory and financial records.

Do not express readiness as a percentage of screens completed. Assess whether a hotel can complete representative operational days, including exceptions, across two staff sessions and the guest app.

## 2. Scope and fresh validation

Reviewed both repository structures, manifests, existing roadmap/audits/database-contract sections, customer and partner route boundaries, shared quote/create/lifecycle/inventory code, reservation operations and amendments, physical assignments, room calendar/maintenance/housekeeping, reporting, guest service agreements and payment paths, notification delivery, authentication/cache boundaries, mobile models/queries/coordinators, and relevant unit/integration/browser test sources.

This is a broad architecture and workflow assessment with focused source tracing. It is **not** a line-by-line audit of every file, a visual usability study, a production security certification, or verification of deployed hotel data. Existing uncommitted work in both repositories was preserved. Only this report was added.

| Check run for this review | Result |
|---|---|
| Web unit suite, external-service opt-ins unset | 63 files passed; 531 tests passed; 104 tests skipped in 10 files |
| Web TypeScript, incremental disabled | Passed |
| Mobile `bun test` | 764 tests passed across 34 files; 0 failed |
| Mobile TypeScript | Passed |
| Deterministic booking-domain reproduction | Same-day 20:00 IST overnight arrival with standard 14:00 check-in throws `CHECK_IN_IN_PAST` |

The reproduction exercised the pure evaluator with a fixed clock, not a live reservation. Test logs for this session were written to `/tmp/helpkey-{web,app}-audit-{tests,types}.log`.

Not run here: Firestore emulator transactions, Redis/worker integration, Razorpay sandbox, Playwright, native device sessions, production build, load tests, live external providers or deployment inspection. Existing tests for concurrency were inspected but skipped in the fresh unit run. Previous documents' verification results are historical evidence, not fresh results from this review. External vendor and tax-law claims in the original research document were not reverified here.

## 3. What is already connected

| Journey | Existing connection | Remaining operational connection |
|---|---|---|
| Discover → select → quote | Web/app call shared public catalog, room/rate and quote APIs; dated offers and duration pricing exist | Verify the exact selected offer and changed-price explanation across both clients with a real backend |
| Quote → book → pay | Server validation, transactional capacity, saved terms, request identities, provider verification and recovery | Preserve these protections when introducing staff-specific creation commands |
| Booking → guest preparation | Saved reservation details, arrival plan, personalization, requests and hotel quote workflows | Surface the guest's needs next to reception's room and check-in decisions |
| Request → hotel response → supplementary payment | Existing requests, agreed versions, separate order/receipt identities, preparation states and worker recovery | One guest-facing account summary and department ownership; avoid duplicate billing |
| Reservation → physical room | Register, transactionally checked assignment calendars and cleaning buffer | Ready-room selection, current/future occupancy timeline, room moves and overstay resolution |
| Checkout → dirty room | Checkout marks the assigned unit dirty when housekeeping is enabled | Create/assign turnover work, set next-arrival deadline, inspect and expose readiness to reception |
| Money → reporting | Provider attempts, hotel receipts, refunds and operational/financial summaries | Folio, settlement, cashier closure, business date and distinct revenue measures |
| Property setup → marketplace | Listing, rates, documents, media review and admin approval | Independent PMS setup/readiness and property-level enablement |

The November 10 mobile parity audit is now a historical baseline. Current mobile code includes hourly support, booking-ID details/receipts, account wishlist, quote protection, arrival updates, checkout personalization and service management. Do not rebuild those features because an older checklist remains unchecked. Key current areas: `app/src/features/bookings/`, `checkout/`, `personalization/`, `services/`, `wishlist/` and their tests.

## 4. Findings, in delivery priority

### F1. Staff discovery and permissions are incomplete for a partner-wide PMS

`lib/services/partner-shell.ts:15` discovers properties by `partnerId == current UID`. A receptionist membership alone does not make the hotel appear. `lib/partner/reservations/access.ts:4` validates active membership but does not enforce action permissions. Owner-only checks in `lib/partner/service.ts:48`, the overview and configuration services create a second access pattern.

Consequently, staff onboarding is more than adding an invite form. Implement membership-based discovery, account eligibility, role/permission evaluation, server-enforced actions, revocation, and role-appropriate navigation/DTOs. Property access must not automatically grant refunds, discounts, rate edits, exports or staff administration. Reuse the membership model's existing role/permission fields with an explicit compatibility policy for current owners.

Include cross-property and cross-role tests for lists, detail, exports, previews, writes and background commands. Global `partner` role handling also needs a defined staff account lifecycle.

### F2. Partner browser account/cache isolation needs hardening

The shell key is `['partner', 'shell']`; many private queries are keyed by property/booking but not account or permission generation. `components/auth/auth-provider.tsx` explicitly clears the previous account's wishlist queries, but does not similarly clear all private partner/admin/customer/notification caches. The partner shell also has its own logout path.

This is a source-level stale-cache risk on shared reception browsers; a cross-account disclosure was not reproduced. Make logout/account changes cancel private requests and remove private cached data. Bind private queries and late-result guards to account/session identity, and refresh property capabilities after role changes. Ensure the current session is authorized before displaying cached operational data. Server authorization remains mandatory.

### F3. Ordinary evening walk-ins fail the customer arrival rule

`createManualReservation` in `lib/bookings.ts:918` calls the public quote flow. `lib/booking/domain.ts:73` anchors overnight start to standard property check-in and rejects past starts. A deterministic 20:00 IST walk-in against a 14:00 standard check-in reproduced `CHECK_IN_IN_PAST`.

Create an explicit staff reservation policy that records the agreed stay/business date and actual arrival separately. Preserve shared availability, price validation, authorization and retry protection. Specify how early arrival, after-midnight arrivals and backdated corrections work; do not globally disable past-date validation for customers. Preview and transactional confirmation must use the same policy.

### F4. Manual guest identity is currently the operator identity

Shared creation writes `guestId: uid` at `lib/bookings.ts:415`. For manual creation that UID belongs to hotel staff; `createdBy` already records the actor. Customer booking lookup and notifications use this guest ID. Manual creation also repeats the lead name for all adults and sets billing to null at line 940.

Separate creator, booker/contact, hotel guest profile, reservation occupants and optional linked customer account. Guests should remain property-scoped by default. Link a walk-in to an app account through an explicit verified claim flow; knowing a phone number must not grant booking access. Design migration of existing manual bookings before introducing guest CRM, messaging or self-service access.

### F5. Booking creation is slow for desk use and lacks a partial advance

The manual form supports paid-in-full or pay-at-property; subsequent partial collections exist. It does not combine ready-room selection and an advance into the creation workflow. Its Today value uses UTC at `manual-booking-dialog.tsx:214`. Authoritative date-price preview is requested only for rates with `datePricingEnabled`, rather than providing one consistent availability/price preview for every staff booking.

Use: stay/source → available room type and optional ready room → guest → payment → review/create. Keep a sticky price, amount collected and remaining balance. Support walk-in, telephone and other agreed sources. Put secondary guest details after the fast save, with an explicit registration-completion state. Preserve request keys across ambiguous retries and unsaved drafts on accidental close.

### F6. PMS operations are coupled to public marketplace availability

Public quote, shared creation and amendment validation require active, approved, publicly bookable property/rates. This means a hotel pausing marketplace sales cannot necessarily continue creating normal internal reservations through those commands.

Introduce explicit PMS entitlement/readiness and operational eligibility, separate from public listing publication. Specify the meaning of owner pause, onboarding, admin suspension and archive independently. Preserve platform-admin restrictions; an internal booking exception must not become a way around an administrative suspension. Public customers continue to require marketplace eligibility.

### F7. Check-in/out does not enforce a complete operational policy

`transitionBooking` at `lib/bookings.ts:886` checks membership, lifecycle and arrival time. It does not require assignment, room cleanliness, registration completion or financial clearance. The drawer's room/balance warnings are advisory.

Define property policies with server enforcement: assignment/readiness at check-in, permitted advance/deposit requirements, checkout balances, unresolved services and manager exceptions. Each exception needs permission, reason and an audit event. Corporate receivables should use an explicit account transfer rather than a fictitious collection. Show precise blockers and available remedies before an operator submits.

Lifecycle status writes also lack the operation-command idempotency contract used by collections/assignment. A successful check-in followed by a lost response can produce a transition error on retry. Return the saved result for an unchanged command and refresh after uncertain responses.

### F8. Numbered-room operations need a timeline and stay-change commands

The existing Rooms area combines configuration with availability/rates and basic housekeeping. `lib/partner/rooms/service.ts:58` derives current occupancy from checked-in bookings; it is not a complete future room-assignment timeline. `lib/partner/reservations/physical.ts` replaces the saved assignment rather than recording move segments.

Add a physical room board and numbered-room timeline. Keep occupancy, cleanliness and maintenance restrictions independent. Add assignment segments and explicit move/extension/early-release commands, preserving consumed time and old-room cleaning work. Existing amendment code only supports restricted future confirmed interval bookings (`amendments.ts:87`) and is not exposed in the current reservation controls.

An overdue guest remains physically present after the scheduled interval ends. Current scheduled inventory/assignment slots do not themselves extend to cover the overstay. Introduce visible conflicts and a resolution command; never silently extend into another booking. Early checkout currently retains the scheduled allocation by design: release/resale must be an explicit policy after turnover, not an incidental status update.

### F9. Payment foundations exist; a complete folio does not

Existing room financial totals, `propertyPayments`, provider attempts, refunds and supplementary service receipts serve different purposes. `bookingOperations` deliberately excludes stay-quote attempts from original-booking payment controls. The UI also hides the general refund action when a booking has online payments (`reservation-operations.tsx:129`), even though the backend has provider refund operations. Mixed online-deposit/property-balance cases need a clear receipt-specific path and permission policy.

Start with a unified read-only account view that preserves original room charges and separate service agreements/receipts. Then implement immutable folio postings with stable source IDs, compensating adjustments and reconciliation. A payment is a credit against a charge, not a second charge. Posting scope must include service quotes, cancellations, credits, refunds and historical exceptions exactly once.

The current web receipt explicitly says it is not a tax invoice (`booking-receipt-modal.tsx:705`). Invoice issuance, credit notes, cashier shifts and business-day closure need separate implementation. Confirm applicable invoice requirements before implementing issuance; this report supplies no legal/tax determination.

### F10. Freshness and activity are fragmented

Reservation lists/details and room workspace generally poll every 60 seconds; the request queue polls every 30 seconds. Operations query data has its own refresh path. Mutations often refresh their own view and a callback rather than an explicit common set of affected property queries. Private query keys are partly centralized and partly handwritten. This can temporarily show inconsistent balances, counts or room status when navigating between modules.

Centralize mutation impact: assignment refreshes reservation/room board; collection refreshes account/list/dashboard; checkout refreshes occupancy/housekeeping; guest request updates refresh request queues and reservation activity. Use consistent property/account query keys and preserve drafts. Show last successful sync, stale/error states and conflict recovery. Define an acceptable freshness target and measure it before adding a realtime transport.

Booking events already exist, but the current reservation drawer omits a general activity timeline. Restore a paginated staff timeline alongside requests/payments so operators can see who changed the stay and why. Client DOM events such as `stay-request-updated` do not deliver changes across another browser/device.

### F11. Multi-property enablement and onboarding are missing product controls

Reservation allocation/payments/amendments and room calendar/housekeeping use independent environment flags, generally disabled by default in production. These are deployment controls, not a full property-specific PMS activation system.

Keep global emergency switches and add property-level enablement, setup version/status, migration/reconciliation results and capabilities. Build a guided setup: room types → physical register → rates/policies → opening reservations/balances → staff → readiness review. Imports need dry run, validation, stable external identities and reconciliation; an existing hotel's bookings must enter the same capacity authority before PMS activation.

Maintain separate marketplace approval and operational readiness indicators. Never equate configured room capacity with a complete physical register or a clean, immediately assignable room.

### F12. Daily closure and distribution remain incomplete

No complete posting folio, business-date/night-audit, cashier-shift or OTA synchronization workflow was found in the inspected source/route inventory. Sidebar Calendar, Payouts, Promotions, Messages and Settings remain disabled Soon entries. Basic housekeeping statuses/history exist; staff task ownership, inspection queues and escalation do not form a complete department workflow.

Reporting currently combines scheduled room-hours across booking modes in interval occupancy and uses current capacity; booked sales use booking creation date. Preserve explicit labels. Add conventional overnight room-night occupancy/revenue definitions and separate hourly utilization. Historical capacity, maintenance exclusions, service revenue, hotel cash and platform payout accounting need explicit definitions.

Notifications are an in-app feed with durable booking outbox delivery. General booking push/email/WhatsApp delivery and mobile notification UX are additional scope; authentication OTP delivery does not establish booking-message delivery.

## 5. Target user experience

### Reception

Default landing page: **Today**, in hotel-local time, with arrivals, departures, in-house, unassigned/not-ready rooms, unresolved payments/requests and overstays. Keep analytical reporting separately accessible.

The same booking opens the same reservation workspace from Today, search, Reservations, room timeline, service queue and notifications. Preserve property/date/filter context and browser back behavior. Suggested workspace tabs: Overview, Guests, Room & stay, Billing, Requests, Activity. The primary action should come from server capabilities with blocker reasons.

Example: “Arrival at 20:00; room unassigned; ₹1,000 advance recorded; birthday setup waiting for approval.” Reception can resolve those items without searching three pages.

### Housekeeping

A mobile-friendly task list shows room number, occupancy/turnover, next-arrival deadline, priority and assigned staff. Complete cleaning → inspection if configured → readiness reaches reception. Avoid exposing unnecessary contact/billing/identity data to this role.

### Guest

One saved reservation shows confirmed stay terms, arrival preparation, requests, hotel responses, amount paid/balance and help/contact actions. Room payment and separately agreed services remain distinguishable within the same account view. Confirmation, request acceptance, payment verification and actual front-desk check-in retain separate meanings.

### Owner and platform admin

Owners manage staff, policies, rates, property reports and setup. Admins manage platform approval, partner PMS activation/health, migrations and failed financial/background work. Guest data from different partner hotels must not become globally searchable merely because the platform holds it.

Suggested navigation: Today; Reservations; Room calendar; Housekeeping; Billing; Guests; Rooms & rates; Reports; Settings. Keep Property Listing, Reviews and Stay Customizations accessible as appropriate. Avoid advertising empty navigation entries as working capabilities.

## 6. Implementation boundaries

Retain these authorities:

- `lib/booking/`: prices, time and shared sellable capacity.
- Existing reservation services: authorized commands and concurrency handling.
- `physicalUnits` and physical calendars: numbered rooms and overlap checks.
- Existing provider records and hotel receipts: payment identity and evidence.
- `lib/stay/`: guest agreements, quotes, preparation and supplementary payment logic.
- Existing outboxes/workers: durable recovery and delivery.

Add clear service boundaries for property setup/capabilities, staff access, guest registration, front desk, billing and business-day closure. Update the database contract before implementing new entities. No new collection contracts are approved by this document.

Centralize account/property capability responses and query keys. Maintain backward-compatible customer APIs for installed app versions. Use shared serialized contract fixtures across the two repositories; avoid a large monorepo/database rewrite as a prerequisite.

Measure full-property reporting reads, calendar reads, transaction retries, polling volume and worker recovery lag on representative hotel workloads. The current code contains bounded scans and potentially broad reporting queries; scalability beyond those workloads is unverified.

## 7. Delivery plan for all partner hotels

| Milestone | Concrete scope | Exit criterion |
|---|---|---|
| A. Partner PMS foundation | Staff discovery/permissions, account cache isolation, property enablement/setup, marketplace/PMS policy separation, guest identity plan, opening-data reconciliation | Two hotels with different staff cannot see or mutate each other's data; each can be activated independently with reconciled room inventory |
| B. Connected front desk | Evening walk-in policy, local dates, fast booking, source, partial advance, ready-room choice, Today, shared reservation workspace/activity, basic account view and mutation refresh | Staff create a realistic walk-in, assign a ready room, collect an advance, check in/out and pass housekeeping work with consistent states |
| C. Billing and stay changes | Immutable folio, service/payment reconciliation, receipt-specific refunds, invoice/credit-note design, in-house extensions, move segments, early release and overstay handling | Charges/credits/payments reconcile; retries never duplicate postings; moves/extensions cannot consume a conflicting room |
| D. Complete operational day | Housekeeping ownership/inspection, maintenance work, cashier shifts, hotel business date, resumable night audit, operational exports/outage recovery | Hotels complete representative business days including midnight hourly stays, staff handover, failed audit retry and payment recovery |
| E. Distribution and commercial expansion | Verified channel integration, external booking revisions/cancellation reconciliation, group/corporate workflows, accounting exports | External records map once to shared capacity; sync failures are visible and recoverable |

Milestones A and B are the immediate work. Milestone B supports an assisted operational beta with explicit billing limitations; it does not establish full standalone PMS readiness. Distribute to partner cohorts after representative workflows pass, then widen availability through property controls. A staged rollout is a validation method for the all-partner product, not a change back to an own-hotel product.

Avoid committing dates until the staff model, opening-data imports, billing scope and representative hotel requirements are agreed. Those affect effort more than the number of screens.

## 8. Cross-system acceptance scenarios

1. Web and app bookings for the same final room race with a staff booking: only one allocation succeeds.
2. A hotel receptionist can check in but cannot refund, edit rates, export restricted data or manage staff without permission.
3. Switching accounts in the same browser never presents the previous hotel's shell, reservation, notification or billing cache; late responses are discarded.
4. Evening walk-in, early arrival and after-midnight arrival follow the property's defined policy and produce correct actual/booked dates.
5. A marketplace-paused property continues only the explicitly allowed PMS operations; administrative suspension retains its intended restrictions.
6. Two staff collect against the same balance concurrently: no overpayment or duplicate receipt is accepted.
7. Online deposit plus cash balance plus paid service appear once each; refunding a property receipt never issues a provider refund for that receipt.
8. Dirty/blocked room check-in is blocked or manager-overridden according to property policy, with actor/reason saved.
9. Checkout marks the correct room dirty; housekeeping completion changes readiness in the other reception session.
10. A room move preserves old/new segments and turnover work; an extension conflicts visibly with the next booking.
11. A guest service quote revised during payment cannot silently change the accepted amount or charge twice; guest and staff see the same saved outcome.
12. A worker restart, delayed webhook or lost response never creates a second booking, payment, posting, invoice or audit close.
13. An operational export is available for an outage; subsequent manual work is reconciled before reopening unrestricted sales. Offline work does not imply guaranteed live capacity.
14. Reports distinguish creation-date sales, stay-date room production, cash movement, supplementary services and platform settlement; hourly activity does not inflate overnight room-night occupancy.

Run these with an isolated real backend, emulator/provider sandbox where appropriate, responsive browser sessions and installed mobile builds. Keep fixture-based UI tests, but do not treat them as proof of the entire service chain.

## 9. Immediate next work package

Produce the property capability/permission matrix and the policies for arrival, readiness, balances and listing pause. Then implement staff discovery/cache isolation, property PMS activation/readiness, guest identity separation and the evening-walk-in path. Build Today and the shared reservation workspace on those foundations, using existing commands wherever their contracts already fit.

The first reviewable product result should demonstrate one complete front-desk journey across two staff sessions and the customer app. Its evidence should include failure/retry cases and reconciliation, in addition to screenshots.
