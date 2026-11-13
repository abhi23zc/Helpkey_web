# Helpkey PMS: codebase assessment and implementation roadmap

Reviewed: 12 November 2026. This is an assessment and proposed design, not an implemented schema change.

## 1. Recommendation

Extend the existing partner workspace into a PMS for small and medium hotels, preserving the shared hourly/overnight booking engine. Begin with a single-property pilot and expand to multiple hotels after daily front-desk and financial workflows are proven.

Helpkey already combines customer booking, partner operations, admin approval, payments, and guest services. Its PMS opportunity is to make the partner workspace capable of running a hotel through a complete operational day, including guests who never booked through Helpkey.

Do not create a second inventory engine or a parallel PMS booking collection. All channels must ultimately reserve against the same authoritative capacity.

## 2. Review scope and confidence

Reviewed the supplied screenshots, repository structure, package/configuration files, database/backend specification sections, partner documentation, central booking services, inventory and pricing domain, reservation services and routes, physical-unit assignment, room workspace, housekeeping, manual booking form, reservation workspace, dashboard/reporting definitions, authorization boundaries, worker/payment processing samples, and relevant test coverage.

This is an architectural review with deeper inspection of the pictured workflows. It is not a claim that every line of the project was audited. Source behavior takes precedence over older implementation notes. The working tree already contained unrelated edits; those were preserved.

Fresh local checks:

- `npm test`: 63 test files passed; 531 tests passed; 104 tests skipped across 10 environment-dependent files.
- `npm run typecheck -- --incremental false`: passed.
- Firestore emulator, Redis integration, Razorpay sandbox, browser suites, production build, live deployment, and live hotel records were not verified in this review.

## 3. Architecture already present

| Layer | Current implementation | PMS implication |
|---|---|---|
| Web application | Next.js 16.3.3, React 19, TypeScript, Tailwind | Keep the existing application and route structure. |
| Authentication | Firebase Authentication and application user roles | Extend property-level permissions for hotel staff. |
| Operational data | Firestore with server-side Admin SDK services | Preserve transactional booking/inventory writes. |
| Client state | TanStack Query, URL-based property/date/filter context | Reuse query keys and navigation context across PMS modules. |
| Inventory | Shared 15-minute interval allocation, plus legacy nightly compatibility | Hourly and overnight stays already compete for shared capacity. |
| Pricing | Nightly/duration rates, date overrides, tax/fee calculations, saved snapshots | Reuse the shared evaluator; introduce explicit staff workflow policies. |
| Payments | Razorpay attempts/refunds and hotel cash/UPI/card-terminal receipts | Extend into billing and reconciliation without replacing provider identities. |
| Background work | Booking recovery, notifications, media/projections, Redis/BullMQ infrastructure | Reuse durable jobs for audit/reporting and future integrations. |
| Media | Cloudflare R2 with metadata/publication controls | Keep identity documents private and separate from listing photos. |
| Operations | Docker configuration, health endpoints, request timing/logging | Add hotel-specific operational alerts and recovery procedures. |

Key source areas:

- `lib/bookings.ts`: quotes, reservation creation, lifecycle, serialization, manual bookings.
- `lib/booking/domain.ts`, `inventory.ts`, `date-prices.ts`, `processing.ts`: time, capacity, prices, payment/refund recovery.
- `lib/partner/reservations/`: filters, authorization, operations, physical assignment, amendments.
- `lib/partner/rooms/service.ts`: room workspace, rates calendar, housekeeping, maintenance.
- `lib/partner/dashboard/`: dashboard reporting and operational definitions.
- `lib/stay/`: guest requests, agreed offers, service preparation, supplementary payments.
- `components/partner/dashboard/`: current operator interface.

## 4. What is implemented, partial, and missing

| Capability | Assessment | Next work |
|---|---|---|
| Property onboarding/listing/KYC | Implemented foundation | Separate internal operations eligibility from marketplace publication. |
| Room types and rate plans | Implemented | Keep configuration separate from daily room operations. |
| Hourly and overnight booking | Implemented shared inventory | Add operational hourly timeline and turnover controls. |
| Manual booking | Implemented with negotiated rates and initial paid/unpaid choice | Fix walk-in timing, add partial advance, source and room selection. |
| Reservation list/search/export | Implemented | Reduce daily operator navigation and clarify date scope. |
| Room-number register/assignment | Implemented, feature gated | Complete physical register and add move history/assignment segments. |
| Check-in/out, cancellation, no-show | Implemented lifecycle | Add operational readiness and financial clearance policies. |
| Date prices, stop-sell, maintenance | Implemented room workspace | Pilot and verify flag/index setup and inventory reconciliation. |
| Housekeeping status | Implemented basic statuses and history | Add staff tasks, ownership, priority, inspection, turnaround deadlines. |
| Property collections/refunds/reversals | Implemented, feature gated | Add cashier shifts and consolidated billing reconciliation. |
| Reservation amendment | Backend exists for restricted future confirmed stays | Current drawer does not expose reservation editing; in-house changes need new design. |
| Guest requests/paid offers | Substantial existing workflows | Surface agreements in the future billing ledger without charging twice. |
| Guest master/registration | Partial contact and booking guest details | Separate operator, guest profile, accompanying occupants, and booker/company. |
| Guest folio | No complete posting-based folio found | Build charges, payments, adjustments, refunds, settlement and history. |
| Tax invoice | Receipt exists, explicitly not a tax invoice | Add issuance, numbering, tax breakdown and credit-note workflow. |
| Business date/night audit | No complete workflow found | Add resumable daily closure after folio foundation. |
| Staff/team management | Membership model is present; UX/access is largely owner-oriented | Build invites and action-specific server permissions. |
| OTA synchronization | No active channel-manager integration found | Integrate a suitable existing provider after API access is verified. |
| Group/corporate accounts | No complete workflow found | Later: multi-room groups, routing and receivables. |

Sidebar labels are not proof of implementation: Calendar, Payouts, Promotions, Messages and Settings currently have empty navigation targets. Conversely, Availability & rates and Housekeeping already exist inside Rooms.

## 5. Assessment of the three pictured pages

### Manual booking dialog

The sections, hourly/overnight switch, room/rate selection, tax display and fixed submit controls provide a useful foundation. For daily hotel use, the current long modal should become a fast desk workflow with a persistent price and availability summary.

Recommended order: stay dates/times and live availability; room type/rate; guest; optional room number; payment; confirmation. A phone booking should be able to remain confirmed without check-in. A walk-in should support creation followed by an explicit check-in action or an atomic, retry-safe combined command.

Add source (`walk_in`, `phone`, etc.), repeat guest lookup, a partial advance, billing company where needed, accompanying guests, and a ready-room choice. Defer nonessential fields until after saving. Preserve idempotent submission and backend price verification.

Specific source findings:

1. `createManualReservation` calls the public quote path. Overnight start is the property's standard check-in time, and `evaluateStay` rejects starts earlier than now. Consequently, an ordinary same-day walk-in arriving after standard check-in can be rejected. This follows from the reviewed code; it was not exercised against a live property. Staff walk-ins need an explicit actual-arrival policy while retaining transactional availability checks.
2. `manual-booking-dialog.tsx` derives Today with UTC `toISOString()`, unlike property-local date helpers elsewhere. This can differ from the hotel date near midnight.
3. Shared creation stores `guestId: uid`; for a manual reservation, that UID belongs to the operator. `createdBy` already identifies the operator. Add a distinct hotel guest identity and optional linked customer account before building guest CRM or self-service claims. Review notification recipients as part of this change.
4. Manual creation repeats the lead guest name for every adult and saves `billing: null`. These are placeholders for a fuller guest registration/billing workflow.
5. Initial payment supports full paid or pay-at-property. Later partial collections exist, but the creation screen lacks a partial advance workflow.
6. Manual creation requires active, approved, publicly bookable property/rates through the shared quote/creation path. A hotel may need internal operations while its public listing is paused. Separate these policies without relaxing inventory or authorization.

### Reservations page

Keep this as the searchable reservation register. Existing filters, URL state, pagination, exports, status views and operational drawer are valuable.

Add a dedicated Today/front-desk view for arrivals, departures, in-house, unassigned rooms, rooms not ready, balances and overdue stays. Preserve the distinction between selected-period counts and current-time warnings. The screenshot's seven delayed check-ins and two overdue arrivals are not enough to establish a bug: these can use different global/current versus selected-range scopes. Make those scopes obvious.

The booking drawer should provide Overview, Guests, Room/stay, Billing, Requests and Activity. Restore a concise staff activity view; events already exist but the current drawer intentionally hides history. Expose future amendment controls only where the existing backend supports them, then implement in-house extensions separately.

Readiness and balance messages are currently advisory. The lifecycle service does not require a physical assignment, clean room, or zero outstanding balance. Introduce configurable, server-enforced policies with specific manager exceptions and recorded reasons. Corporate billing requires an explicit transfer to an account rather than pretending money was collected.

### Rooms page

The pictured room cards work for configuring products for sale. They should remain a Room types view. Daily staff need an additional physical room board showing room 101/102/etc., floor, occupancy, cleaning condition, arrival/departure time, maintenance, next arrival and urgency.

The screenshot's 60 configured rooms is aggregate capacity, not evidence that 60 physical room records exist or are available. Room registration must not increase aggregate capacity. Reconcile configured capacity, active registered rooms and blocked units before the pilot.

Use separate room attributes for occupancy, cleaning condition and availability restrictions. A room can be occupied and dirty, vacant and dirty, or clean but blocked for repair. Existing housekeeping already distinguishes cleaning from occupancy; preserve that separation.

## 6. Product structure

Recommended navigation as modules become functional:

1. Front desk / Today.
2. Reservations.
3. Room calendar: numbered-room timeline, daily and hourly zoom.
4. Housekeeping: mobile task board and inspections.
5. Billing: folios, collections, refunds, invoices, cashier shifts.
6. Guests: profiles, registration and visit history.
7. Rooms & rates: current configuration and availability/rate editing.
8. Reports: operations, room production, financial summaries and audit.
9. Settings: staff, policies, business-day configuration and integrations.

Retain listing and reviews as marketplace functions. Retain guest customizations as a strength, integrated with reservations and billing.

## 7. Operational rules that must be designed first

### One inventory authority

Keep room-type sellable capacity distinct from numbered-room assignment. A physical unit must not be assigned to overlapping stays, while aggregate inventory must include all channels, holds, maintenance and cleaning buffers. Every create, cancel, extension, move and amendment must update its relevant allocations atomically and safely under retries.

Early checkout currently retains scheduled inventory and physical allocation, as documented. Decide whether operational resale should release unused time after cleaning; make this an explicit command/policy. Conversely, an overdue checked-in stay must trigger an operational resolution: scheduled allocations ending does not mean a guest has physically vacated the room. A PMS needs an overstay policy and conflict handling with the next reservation.

### In-house changes

Current amendments are limited to future confirmed interval-inventory bookings and reject several agreements/discount/refund combinations. Extend-stay and room-move operations must preserve consumed time, reprice only the agreed scope, check future availability, retain promised services, and record actor/reason. Model assignment segments for moves; replacing one unit ID loses the room history and can mishandle cleaning.

### Billing and money

A folio is the itemized guest account, including accommodation, taxes, services, discounts, payments and adjustments. It needs immutable postings and compensating entries, stable source references and a reconciled balance. A finalized invoice is a separate document; a receipt acknowledges payment.

Do not copy existing payment totals into new charge lines and then collect them again. Original booked extras and supplementary service agreements currently follow different paths. Map each existing receipt/agreement once into billing, using stable deduplication identities. Keep online provider transactions separate from staff assertions of cash/UPI/card-terminal collection.

Platform collections, hotel receipts, room revenue, commissions and owner payouts are different measures. Existing booked sales are grouped by booking creation date; they must not become a room-revenue report by changing the label.

### Business date

Keep property-local calendar date, actual UTC timestamps and hotel business date distinct. An after-midnight payment can belong to a previous open business day according to the property's policy. Night audit should reconcile exceptions, post due charges once, close a business date and generate immutable reports. It must resume safely after a worker crash. Do not make automatic no-show/extension rules implicit.

### Staff access

Current reservation authorization checks active membership; many configuration services require owner role. The shell lists properties by `partnerId`, so a staff member's membership alone does not make the property appear. Add both membership-based property discovery and server-side action permissions before inviting staff.

Suggested permissions include `reservation.create`, `reservation.check_in`, `reservation.extend`, `room.assign`, `housekeeping.update`, `payment.collect`, `payment.refund`, `rate.manage`, `audit.close` and `staff.manage`. Suggested roles are owner, manager, receptionist, cashier, housekeeper and maintenance. Housekeeping users should receive minimal operational guest details.

### Reporting

Report overnight room-nights, ADR and RevPAR using explicit revenue/capacity definitions and blocked-room policy. Report hourly utilization and hourly revenue separately. A room sold multiple times in one day must not silently inflate a conventional room-night occupancy report. Track historical capacity if reporting past occupancy accurately is required; the current dashboard uses current configured capacity.

## 8. Proposed domain additions

These are conceptual entities, not approved Firestore collection contracts:

| Entity | Purpose |
|---|---|
| Hotel guest profile | Walk-in/repeat guest independent of staff and app account. |
| Reservation occupants | Lead and accompanying guests, verification/registration state. |
| Room assignment segment | Unit and start/end range, with move reason/history. |
| Folio and immutable postings | Itemized guest balance, payments, adjustments, source references. |
| Tax invoice / credit note | Finalized legal billing snapshot and numbering. |
| Cashier shift | Opening float, expected/actual tender, variance, approval. |
| Business day / audit run | Open/close state, posting checkpoint, immutable report references. |
| Housekeeping / maintenance task | Assignee, priority, due time, completion and inspection. |
| Channel mapping / external reservation link | Room/rate mapping, external ID, revision and sync state. |

Read the complete database specification before implementing these additions. Reuse existing physical units, room calendars, blocks, memberships, payment/refund records and events. Schema names appearing in a specification do not prove working services exist.

## 9. Delivery order and exit criteria

### Phase 1: operational foundation and front desk

- Fix walk-in arrival rules and property-local date handling.
- Separate guest identity from operator identity.
- Implement staff discovery and authorization; define readiness/financial exception policies.
- Register physical rooms and reconcile capacity.
- Create Today view, room board, fast manual booking and partial advance.
- Include basic itemized charges and closing-balance visibility; retain current external invoicing if full invoice issuance is deferred.

Exit: reception can create a realistic evening walk-in, allocate a ready room, collect an advance, check in and later close the stay, with consistent room/payment state and audit trail. Concurrent attempts at the last room cannot both succeed. This phase is suitable for an assisted pilot, not a complete standalone accounting replacement.

### Phase 2: billing and stay changes

- Implement folio postings and reconciliation against existing payments/services.
- Add tax invoice/credit-note workflow with verified property tax configuration.
- Add extensions, room moves, upgrades and early/late departure policies.
- Add cashier shifts and permission-controlled discounts/refunds.

Exit: charges, receipts, refunds and closing balance reconcile; repeated commands do not duplicate charges or invoices; an in-house extension cannot consume another guest's room.

### Phase 3: daily hotel operations

- Housekeeping assignments, mobile updates, inspections and escalation.
- Maintenance tickets connected to actual inventory blocks.
- Business-date controls, resumable night audit and daily manager reports.
- Arrival/in-house/balance exports and a practical outage procedure.

Exit: the hotel completes multiple representative business days, including midnight hourly stays, staff handover, dirty-room turnover and failed audit retry, with accountable exceptions.

### Phase 4: distribution and commercial features

- Integrate an accessible existing channel-manager provider.
- Map rate/room IDs, deduplicate external reservations, process modifications/cancellations, reconcile sync failures.
- Add group reservations, corporate billing, accounting export, payment links and optional POS/door-lock integrations where hotel demand justifies them.

Exit: external channels and Helpkey share reconciled availability with visible failures. Do not claim overbooking prevention based only on a successful outbound API request.

## 10. Research findings and constraints

- Oracle's official integration catalog separates reservations/rates, front desk, housekeeping, back office, distribution and reporting. This supports the proposed module boundaries; it is a reference for workflows, not a requirement to copy enterprise scope. [Oracle Hospitality Integration Platform](https://www.oracle.com/hospitality/integration-platform/)
- Cloudbeds describes night audit as posting pending charges, applying configured reservation updates and advancing the operational date, with permission controls and once-per-day execution. This supports a dedicated business-date/audit design. [Cloudbeds night audit](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/31030047512347-Night-Audit-in-Cloudbeds-PMS-Overview-and-Key-Features)
- OPERA distinguishes cleaning states and inventory-affecting room restrictions. Use explicit Helpkey policies; vendors can assign different inventory effects to similarly named out-of-order/out-of-service states. [Oracle room statuses](https://docs.oracle.com/cd/E81346_01/doc.183/e81527/c_housekeeping_room_statuses.htm)
- Booking.com's public connectivity portal currently states that new connectivity-provider integrations are paused and individual properties cannot directly connect to its Connectivity APIs. An existing channel-manager connection is the practical route to investigate; access, supported channels, commercial terms and certification must be verified before committing delivery. [Booking.com connectivity portal](https://connect.booking.com/), [Connectivity API documentation](https://developers.booking.com/connectivity/docs)
- CBIC Rule 46 specifies tax-invoice particulars, including supplier details and financial-year-unique invoice numbering. Build invoice configuration against applicable current requirements, with property/accountant validation; this assessment does not determine the hotel's tax rate or e-invoicing obligations. [CBIC Rule 46](https://taxinformation.cbic.gov.in/content-page/explore-rules/1000136/1000001)
- Mews recommends accessible operational exports for outages. A cloud PMS pilot should include a way to retain needed arrival/in-house/balance information and reconcile temporary manual work after recovery. [Mews emergency reports](https://help.mews.com/s/article/Emergency-reports?language=en_US)

## 11. Technical direction

Keep the present stack for the pilot. A database rewrite is not justified by this review. Define service boundaries for front desk, guests, billing, housekeeping and audit, alongside the existing booking and room services.

The current interval calendar writes room-type/day documents, which can become a contention point as simultaneous sales grow. Measure transaction retries, query reads, operator refresh latency and payment reconciliation lag with representative workloads before designing sharding or a different datastore.

Split large UI files as the relevant workflows change. Several central partner components are roughly 900–1,600 lines; extending them indefinitely will make state and business-rule coupling harder to maintain. Keep domain commands on the server, derive UI eligibility from server capabilities, and add meaningful concurrency/integration tests for financial and inventory changes.

Production defaults matter: reservation allocation/payments/amendments and room calendar/housekeeping are independently gated and generally default off in production. Source presence and localhost visibility do not establish deployed availability. Verify flags, indexes, compatible worker versions, legacy inventory state and a restore/reconciliation procedure for the canary hotel.

## 12. Decisions to resolve before implementation

Confirm the pilot hotel's room count and physical room register; whether it already uses another PMS/channel manager; overnight/hourly mix; booking sources; cash/deposit/refund practices; billing and company-account requirements; staff roles; early/late arrival policies; and the intended business-day cutoff.

Also choose whether the immediate product is a PMS for the user's own hotel, an optional PMS for Helpkey partners, or a paid multi-property SaaS. The recommendation above assumes the own-hotel pilot first, with architecture that preserves future partner expansion. Marketplace approval must remain separate from permission to operate an internal hotel workspace.
