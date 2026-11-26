# Hotel accounting — Step 3

This phase records evidence and accounting obligations. It never charges a guest,
refunds a payment, collects hotel dues, transfers a payout, or offsets existing
hotel dues against hotel payables. The existing active admin manages accounting;
hotel owners have read-only access. Hotel staff do not receive accounting access.

## Simplified accounting workspace

Admin: `/admin/accounting`. Owner: `/partner/accounting`.

Three cards show Hotel balance (outstanding payable before final deductions), Hotel dues (kept separate from payable), and Pending collections (online plus hotel collections, with both components shown). These accounting balances are explicitly distinguished from payout availability; View payouts opens the selected hotel's payout workspace.

Bookings lists included bookings, with historical bookings behind a disclosure. Needs attention collects processing failures, review states, negative balances and reconciliation findings. Routine processing stays in Bookings. Bookings excluded from totals show their last recorded amounts only inside details, labelled as reference amounts. Payment history lists actual collections, refunds and recorded hotel payouts, with Received/Refunded/Paid statuses. Calculation assessments and replacements appear only inside Accounting activity; they are labelled No payment rather than displaying a commission estimate as a money movement. Payment history and accounting activity have independent pagination.

Admin retry, original-booking inclusion and summary rebuilding are inside each booking's Accounting tools disclosure. Including a historical booking explains its accounting effect and requires the existing original-agreement validation. The read-only Accounting health check compares evidence and reports findings in Needs attention. Owner views contain no admin commands. Query retries continue using owner-only endpoints for owner sessions. No financial calculation, authorization or journal-writing behavior was changed for this redesign.

## Journal and balances

`hotelAccountingJournalV1` contains permanent events with debit and credit lines
stored together in each document. Each event balances in integer paise. It records
the booking, hotel, currency, source path and fingerprint, unique event reference,
source occurrence date, journal recording date, agreement/calculation versions,
settings revisions, status, and any linked original entry. The browser cannot
write these collections. There is no balance adjustment endpoint.

The journal is the source of truth. `hotelAccountingStateV1` stores a rebuildable
per-booking summary and processing information. Hotel totals add the separate
booking accounts; there is no net balance across bookings. Reads independently
recalculate summaries from journal lines and withhold inconsistent projections.
Pending, review and earned-commission amounts describe different aspects of the
booking and must not be added together as a settlement balance.

Account treatment:

- Verified online capture: debit online collection clearing; credit pending online
  booking funds. An order or authorization has no collection effect.
- Hotel collection: debit hotel collection clearing; credit pending hotel booking
  funds. These clearing accounts describe hotel-held funds, not HelpKey cash.
- Valid completed checkout: debit earned commission awaiting allocation; credit
  commission income, using the original saved agreement. Collection is independent
  of earning. A zero commission is valid when explicitly agreed.
- Once the original booking is fully paid and its evidence reconciles, debit
  pending online/hotel funds and clear hotel collection evidence. Credit the
  commission awaiting allocation, recognize the remaining online funds as hotel
  payable, or recognize any unfunded commission as hotel dues. Online funds cover
  that booking's commission first. This is its initial allocation, not an offset
  of an existing payable against dues.
- Incomplete guest payment leaves settlement pending even after checkout. Earned
  commission awaiting allocation remains separately visible.
- Supported collection reversals and completed refunds reverse collection effects
  against their original source. A refund request is not money returned.

Journal source statuses describe the event when posted; a later allocation does
not edit a previously pending collection event. Linked recognition reversals and
replacement assessments explain subsequent treatment. A zero-line-value assessment
records non-monetary evidence without inventing a financial amount. An unknown
commission remains null, not zero.

Source occurrence dates use saved source timestamps. For existing captures this
is the saved verification/receipt date; it is not an invented provider or bank
settlement timestamp. Unavailable dates remain unknown and require review.

## Worked examples

All examples use room charges of ₹2,000, illustrative guest tax of ₹100, and
commission of ₹200. They exclude commission tax, statutory deductions, gateway
fees and other adjustments. Guest tax is recorded as pass-through evidence, not
commission income. No new tax assessment is performed.

| Collections | Before checkout | After valid checkout |
| --- | --- | --- |
| A: online ₹2,100; hotel ₹0 | ₹2,100 pending online funds | ₹200 earned commission; ₹1,900 hotel payable before unassessed adjustments |
| B: online ₹0; hotel ₹2,100 | ₹2,100 pending hotel collections | ₹200 earned commission; ₹200 hotel dues before unassessed adjustments |
| C: online ₹400; hotel ₹1,700 | Both collections pending separately | ₹200 earned commission; ₹200 hotel payable before unassessed adjustments |
| D: online ₹400; hotel ₹0; guest owes ₹1,700 | ₹400 pending online funds | ₹400 remains pending; ₹200 earned commission awaits allocation; no recognized hotel payable or dues |

For D, the expected hotel payment never becomes a hotel collection. Recording the
remaining ₹1,700 through the existing collection operation permits later allocation.
For every example the displayed recognized balance is before unassessed adjustments,
not a final amount or an amount available for payout. The four deduction categories
remain explicitly unassessed; they have no default numeric zero.

## Changes, failures and corrections

The shared transaction/batch adapter adds a private accounting outbox record and
marks the booking summary dirty in the same commit as a financial source change.
Until processing finishes, previous settlement figures remain visible as last
recorded amounts and are excluded from current totals. Accounting enqueue delivery
failures cannot turn a successfully committed payment into a failed payment.

`booking_accounting` uses the existing projection queue, dispatcher, durable outbox
retry, and recovery system. The processor reads authoritative sources inside its
Firestore transaction. It creates source events, complete balanced journal events,
linked recognition reversals, replacement assessments and the summary atomically.
The booking state document serializes concurrent processing. Stable globally unique
capture keys and source fingerprints prevent repeated effects. Lost responses,
reordered notifications and worker retries are safe: processing assesses the current
saved evidence rather than applying browser-provided deltas.

Separately accepted hotel services save private immutable records under `bookingFinanceAgreementsV1/{bookingId}/services/{serviceId}`. Their ownership, quote version, accepted price and commission treatment are matched to the original room agreement and allocated verified receipts. Room-only policies exclude service commission. Selected-extra policies require the original category and a verified pre-tax amount when commission applies; no tax breakdown is invented. Original room invoices and agreements stay unchanged.

Existing service evidence can be reconciled with the active-admin POST `/api/admin/accounting/services?propertyId=<id>` (`reconcile` or `confirm`, UUID request ID). Automatic reconciliation requires a matching property catalog identity; missing ownership/category/pre-tax evidence stays blocked. Explicit confirmation records its actor and reason and never overwrites a service snapshot. Reserved or paid bookings cannot change service terms through this command. Booking and guest summaries expose only safe payment amounts, never private commercial terms.

Verified full service refunds reverse the linked service collection and remove that service’s entitlement and commission. Pending refunds, partial service refunds without a confirmed charge adjustment, room amendments, cancellation treatments and inconsistent sources remain actionable review cases. Unchanged monetary lines are not reversed for lifecycle-only updates; a non-monetary audit assessment preserves the evidence change. Existing journal history is immutable.

If an already posted source is altered or disappears, the processor preserves the
original financial effect and places its recorded amount under review. Source
ownership conflicts prevent recognition. Unbalanced journals or excessive source
counts stop posting and remain visible as processing failures. The current limit
is 150 source events in one assessment; larger bookings need review and an extended
bounded processing design. There is no arbitrary manual adjustment or review-clearing
button in this phase.

## Activation and historical bookings

No production start date is configured by this implementation. Set
`HOTEL_ACCOUNTING_START_AT` to an explicit UTC ISO timestamp in the web server and
projection workers when activating, and keep it fixed. For example,
`2026-11-24T00:00:00Z` is used only by isolated tests, not as a production setting.

New bookings whose saved creation timestamp is on or after the configured cutover
are automatically eligible. Existing bookings remain excluded, even if their
current payment or lifecycle records change. They can be enrolled only through
the admin's **Reconcile original evidence** action. This idempotent operation queues
accounting from the original saved Step 2 agreement and original source records;
it never captures today's finance settings for an older booking. Bookings without
a saved agreement cannot be enrolled and do not create opening balances.

Run the existing projection worker and, in legacy/hybrid mode, its dispatcher;
queue mode also needs the existing recovery worker. `npm run all` starts the
website and projection services; plain `npm run dev` does not start projection
workers. Deploy the existing projection-outbox indexes before activation. This
feature needs no new composite journal indexes. Do not activate the cutover until
those services are running. Development and verification use disposable localhost
emulators only, with payment-provider credentials disabled or mocked.

## Inspection and recovery

- Admin: `/admin/accounting` → select a hotel. Inspect separate totals, booking
  states, source-linked journal entries, processing errors and review reasons.
- Owner: `/partner/accounting` → select their hotel using the existing hotel
  selector. Server authorization checks current owner access on every read.
- **Check accounting** is read-only. It compares collections and other evidence
  against journal references, debit/credit totals, ownership, saved agreement and
  checkout commission, and cached summaries. Historical exclusions are reported.
- **Retry accounting** queues only accounting assessment. It does not retry a
  charge, guest refund, or payout. A new outbox record permits recovery from an
  exhausted earlier job while preserving the original failure record.
- **Rebuild summary from journal** recreates only the cached summary, preserving
  journal history and any pending source processing. It does not resolve source
  discrepancies or change the monetary journal.

Private APIs are `/api/admin/accounting`, its `/commands` and `/reconciliation`
routes, and the owner-only `/api/partner/properties/[propertyId]/accounting` route.
Admin commands accept an action, booking ID and UUID request ID; no amounts.
The journal remains absent from customer bookings and public hotel responses.

## Remaining limits before payouts

Approved deduction/tax/fee rules, supported commercial-change assessments, external
provider/bank settlement reconciliation, payout controls and money-movement
integration are still required. Bank onboarding, dues collection, automatic offsets,
listing restrictions, statements and exports are outside this phase. Account reads
scan a hotel's journal and bookings for correctness; large-scale reporting would
need bounded journal-derived aggregates in a later phase.
