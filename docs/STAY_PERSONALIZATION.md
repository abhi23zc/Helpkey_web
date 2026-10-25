# Stay personalization and pre check-in

Customer checkout optionally collects Family, Couple, Business and Solo preferences. These show suggestions without reordering the catalog. All eligible hotel offerings remain accessible, and the existing special-request text field stays available. Room/property/rate amenities remain included features rather than purchasable options.

## Partner setup

Use **Partner → Stay Customizations** for the selected property. Create hotel-provided items, preparation services, or approval-based free room preferences. Configure applicable rooms and overnight/hourly stays, traveler suggestions, connector/variant choices, final unit price per stay, quantity limit shared across variants, advance notice in minutes, confirmation method, and active/paused status. Empty room selection means all rooms. New hotels have no offerings automatically.

Prices are entered as the final inclusive customer amount. Zero means Free. The limit is per reservation, not shared physical stock; use hotel approval for scarce items. Existing room amenities are managed through the existing room/listing editors.

## Payments and commitments

The quote and booking contracts accept optional `customizationSelections` (`offeringId`, nullable `variantId`, `quantity`) and `travelerPreferences`. Empty defaults preserve older clients. Eligibility and agreed terms are rechecked inside the inventory transaction; changed prices/terms require a new quote.

Reservation records retain immutable agreed names, descriptions, variants, quantities, unit/line prices, version, confirmation conditions, cancellation policy and absolute preparation deadline. Catalog edits and pauses do not rewrite existing commitments. Mutable request status, hotel response, and preparation lock are separate from those terms.

Room pricing/tax/fee fields retain their meaning. `extrasTotalPaise` is additional and tax inclusive. Online bookings collect the full extras charge plus the existing room amount due now, including room deposits. Pay-at-property bookings collect the combined balance at the hotel. For a ₹1,000 room with a ₹250 deposit and ₹200 decoration, payment due now is ₹450; hotel balance is ₹750.

Paid approval requests are charged at purchase. Hotel decline records a line credit and queues a deterministic partial refund using the existing refunds worker, leases, reconciliation, and provider idempotency. Unpaid pay-at-property extras receive a balance credit. The original purchase total remains unchanged; DTOs expose `effectiveTotalPaise`, `netPaidPaise`, `customizationCreditPaise`, and the correctly adjusted `balanceDuePaise`. Receipts preserve the original amount and show adjustments/refunds.

Extras follow the snapshotted room cancellation policy. Cancellation reserves only amounts not already reserved/refunded for declined extras, applies the policy to the remaining commitment, and cancels outstanding requests in the same transaction. Paid requests cannot be edited through pre check-in. Refund processing requires the existing booking/background workers and Razorpay configuration; no separate payment provider or post-booking charging path is added.

## Arrival and staff preparation

Confirmed guests can save drafts or submit expected local arrival time, review existing guest names/contact details, update travel preferences and arrival notes, and edit eligible free requests. Submission requires arrival time and guest review. Saving later edits returns pre check-in to Incomplete until resubmitted. No new identity details or documents are collected.

Pre check-in remains available until hotel check-in or booked departure. Expected arrival does not change booked start/end times or preparation deadlines. Older reservations without explicit UTC bounds use their saved local dates/times. Request edits stop at their saved deadline or once preparation starts. Paused offerings retain existing commitments and permit eligible reductions/removal, but no increases/new selections. Historical declined/cancelled requests remain recorded; prepared offerings cannot be removed and recreated to bypass the lock. Each booking retains up to 100 request-history entries, then directs further changes to the hotel.

Staff use the live Reservations inspector: Requested → Confirmed or Declined → Preparing → Ready → Fulfilled. Immediate offerings start Confirmed with a confirmed booking. Declines require a customer-visible explanation. Request mutations and pre check-in saves use a booking revision to reject concurrent stale edits. All changes create booking audit events and use the existing notification outbox. Visible itineraries and reservations refresh every 15 seconds and on focus without discarding form drafts; requests do not overlap background reservation loads.

## API and storage

- `POST /api/bookings/personalization`: all active hotel offerings for a validated hotel/room/rate/stay; checkout explains room, stay-mode and preparation-deadline restrictions. Paused listings remain hidden.
- `GET/POST /api/partner/properties/[propertyId]/stay-customizations`: owner catalog and version-checked create/edit/pause.
- `GET/POST /api/bookings/[bookingId]/pre-checkin`: owned booking options, draft saves and submissions.
- `POST /api/partner/bookings/[bookingId]/customizations`: active property staff request transitions.

Catalog storage is `properties/{propertyId}/stayCustomizations/{offeringId}`. Booking fields are additive: `customizations`, `travelerPreferences`, `preCheckin`, `stayRevision`, `extrasTotalPaise`, `roomTotalPaise`, and `customizationCreditPaise`. Missing fields have safe legacy defaults. Operational data remains accessible through authenticated server DTOs, with browser Firestore reads/writes denied. No destructive migration or new compound index is required.

## Verification

- `npx vitest run` — domain, pricing, contracts, and regression tests.
- `FIRESTORE_EMULATOR_HOST=127.0.0.1:8787 npx vitest run tests/stay-transactions.emulator.test.ts tests/booking-transactions.emulator.test.ts` — isolated Firestore transactions, snapshot preservation, concurrency, authorization, deposits, decline credits, cancellation, and refund processing. Start the cached Firestore emulator with Java 21 or later and project `demo-helpkey-bookings`; never point these tests at a live database.
- `npm run test:e2e:stay` — real checkout, itinerary, owner editor, and reservation components at desktop/mobile sizes with mocked HTTP services. Screenshots/traces are in `test-results/stay`.
- `npm run typecheck` and `npm run build -- --webpack` — type and production compilation checks.

Browser fixtures and mocked provider responses do not validate a live Razorpay transaction or production delivery latency. No live offerings/bookings are created by this feature’s verification.

### Variant final prices

Owners can set a **Default price** and an optional final price for each variant.
A blank variant price (API `null`) inherits the default; `0` explicitly means
Free. Variant prices include all charges and replace the default rather than
adding a surcharge. Omitted variant prices from older API clients preserve the
existing override for the same stable variant ID. Converting to Room preference
clears overrides; positive preference prices are rejected.

Customer cards show the common price or range, with each choice’s actual price
beside its quantity. Quantities share the offering limit and all room, deadline,
approval and cancellation terms. Quotes and reservation transactions resolve the
same prices and reject changed versions or prices through quote refresh. Saved
unit and line prices remain unchanged by catalog edits. Online deposit bookings
collect the full extras amount upfront; declines refund the saved line amount.

Pre check-in allows new free variants even under a paid default, and excludes
paid variants even under a free default. Paid commitments are retained and count
toward the shared quantity limit alongside free choices. Existing free requests
keep their saved terms; increases require that same variant to remain available
and free. Preparation, declined-request and deadline restrictions still apply.

No migration or automatic repricing is needed. Existing variants, including
Cosmozin Hotel’s active offerings, inherit their existing default until edited.


### Three-stage customer checkout

Checkout now presents Guest details → Personalize your stay → Review & pay.
Personalization is visited as a normal stage, with **Continue to review** enabled
without any selections; there is no separate Skip requirement. Guest fields,
identity inputs, notes and selections stay in the mounted checkout while moving
between stages. Native history uses a UI-only `step` query parameter and supports
Back/Forward; reloads and direct links restart at guest details. No identity or
contact information is written to browser storage or the URL.

Extras have category navigation, search across offering/variant names and
descriptions, Free options/Paid extras/Selected filters, compact cards, and
variant quantity steppers. Mixed-price offerings appear in both price filters;
selected siblings remain in the selection summary when hidden by a filter.
Recommendations appear under optional trip suggestions and do not reorder cards.
The final stage shows saved quote line prices, free requests, payment split,
cancellation conditions and required consent before reservation creation.

Owners select Guest browsing category when editing an offering: Room essentials,
Devices & convenience, Food & drinks, Celebrations, Room preferences, Other extras.
The optional `category` catalog field uses keys `room_essentials`, `devices`,
`food_drinks`, `celebrations`, `room_preferences`, `other`. Existing room preferences
fall back to Room preferences and other legacy offerings to Other extras. Older
clients omitting category preserve the saved value. Categories do not change
pricing or reservation snapshots. No live catalog migration is performed.

Visual browser checks cover the three stages at 390px, 768px and 1366px, including
47-offering catalogs. Checkout uses the public hotel theme tokens, compact desktop
summary, mobile stay identity and a safe-area-aware action bar. Pre check-in
retains its separate existing picker and eligibility rules.


### Discoverable unavailable options

Customer catalog search and categories include every active offering, including
ones that cannot be selected for the chosen room, stay mode or arrival deadline.
Selectable options appear first. Other options are grouped under **Unavailable
for this stay**, collapsed by default to keep the catalog compact. Searching opens
the matching unavailable group automatically and shows a short restriction reason,
price and disabled action; descriptions and variant prices remain under Details.
Trip suggestions only recommend eligible options. Quote and reservation creation
still reject ineligible selections; discovery does not bypass preparation rules.
