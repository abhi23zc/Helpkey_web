# Personalize Your Stay — connected first version

## Customer journey

The existing checkout remains **Guest details → Personalize your stay → Review & pay**. Guest details offers one optional trip type: Business, Couple, Family, Friends / Group, Solo / Traveller, Special occasion or Other. Recommendations use this choice without restricting the catalog. Legacy bookings retain the full saved `travelerPreferences` array; pre check-in does not silently reduce it to one value.

Personalization starts with at most eight eligible, deterministic recommendations (hard cap ten in the shared helper). Matching owner tags rank first, then useful free options and category diversity. There are no invented offerings or AI recommendations. **Browse all**, search, relevant category selection and Free/Paid/Selected filters remain available. Selected names and removal actions remain above the catalog when the browse mode changes. Unavailable active offerings appear separately under a collapsed disclosure in Browse all; search opens matching unavailable results with room, stay mode, inclusion or deadline reasons. Unavailable offerings never enter the shortlist. Paused offerings remain hidden.

Continuing without selections is supported. Guest information, trip type, input drafts, general hotel note and selections remain in the mounted checkout while navigating stages. Browser Back/Forward uses the existing UI-only step parameter. Reloads start at Guest details; no identity/contact data is persisted in browser storage or URLs.

## Owner library and forms

Use **Partner → Stay Customizations → Create offering**. Search templates (cake, charger, pillow, etc.), select an editable draft or create from scratch. Selecting a template does not save or publish. Before saving, the owner explicitly reviews prices, eligibility, advance notice and confirmation settings.

The universal offering form separates Yes/no, Choose one, Choose multiple and Text responses from optional quantities and Free/Paid pricing. All offerings can be skipped. Quantity limits are shared across options; without quantities, a multiple-choice limit counts distinct options. Preferences can be free or paid. Existing form types keep their saved behavior through a compatibility adapter; scheduled services, packages and hotel quotes remain available under additional settings. Variant prices remain final overrides, not surcharges: blank/API null inherits Default price; zero means Free. Omitted override fields from older clients retain the stable variant's saved price. See [Universal offering responses](OFFERING_RESPONSE_FORMS.md) for contracts, snapshots and compatibility.

Priced variants handle size or tier; independent choice groups handle flavour/design without manually enumerating combinations. Choice groups and guest notes can be required or optional. Independent choices do not add surcharges; use a priced variant for any choice that changes the price. Scheduled services require a service time; owners can require people and notes. People and requested whole hours are collected where their pricing units need them.

The full category library covers Comfort, Bathroom, Food, Celebrations, Family, Business, Technology, Room preferences, Housekeeping, Transport, Wellness, Experiences, Villa/group services, Pets and Other. Existing `room_essentials` maps to Comfort and `devices` to Technology without rewriting stored records. Other legacy values remain supported. Pet requests require the property's explicit `petPolicy.allowed === true` (compatible explicit petsAllowed fields also work); unspecified does not count as permission.

Optional illustrative JPEG/PNG/WebP images up to 4 MB can be uploaded or captured when the device supports it. Images are decoded, metadata stripped, resized and converted to WebP using Sharp, then stored through the existing private R2 helper. Property-scoped image IDs are verified on save. Owners can preview, replace and remove images. Customers can only read images attached to active offerings of an active approved bookable property. Draft images require owner membership. Upload errors preserve the draft and an in-flight upload blocks saving. Photos are labeled illustrative; icon fallbacks remain when there is no image. Removing an attachment does not remove the archived object immediately; automatic unused-image cleanup is not included.

## Prices and saved agreements

All prices are final and inclusive of charges. The server resolves prices during quoting and again inside reservation creation, with the existing fingerprint/version refresh protection. The snapshot saves names, descriptions, stable variants, guest inputs, pricing unit, billable quantity, unit and line prices, cancellation terms and absolute deadline. Catalog edits and pauses never reprice or erase it.

| Unit | Billable quantity |
| --- | --- |
| Item | Selected quantity, once per stay |
| Stay | Selected quantity, once for the booking |
| Package | Number of selected packages |
| Night | Selected quantity × booked nights; overnight stays only |
| Person | Selected quantity × participating booked adults and children; defaults to all adults and children; infants excluded |
| Hour | Selected quantity × requested whole service hours; if omitted, the remaining booked stay from the chosen service time (or arrival) rounded up |

Explicit service hours must fit before departure. Service dates/times must be upcoming and inside the booked stay, and people cannot exceed the booked adults plus children. Review and selection summaries show billable quantity × unit price = line total. Shared quantity limits, room/stay eligibility and preparation deadlines continue to apply across variants.

Included amenities remain in the room/property/rate snapshot. An exact amenity name/code match cannot be sold again unless the owner explicitly marks it as an additional quantity or upgrade and describes that additional service. Owners can link an amenity code when the offering name differs. Semantic matching of arbitrary descriptions is intentionally not attempted; owners must review inclusion links and room applicability. Requests cannot promise a different room type or change a room's included features.

## Approval, quotes and payments

New requests carry `agreementVersion: 2`. Existing requests without it keep their original accounting and status semantics.

- **Immediate paid extra:** included in checkout, fully collected online even with a room deposit. Existing pay-at-property and snapshotted room cancellation terms remain.
- **New approval request with a known price:** shows its estimated line price but is excluded from checkout total/payable. The hotel can approve for free, decline with an explanation, offer the saved price or send a revised final quote.
- **Unlisted/custom request:** clearly awaits review/quote. The internal zero placeholder is never presented as a free confirmed promise. The general hotel note remains separate.
- **Free hotel approval:** becomes Confirmed without payment.
- **Hotel price quote:** records exact amount, scope, conditions, expiry and version. The customer explicitly accepts or declines the exact version. Changing or withdrawing a quote invalidates prior acceptance/payment eligibility.
- **Accepted paid quote:** stays Requested / Awaiting payment until provider-verified capture. Accepting a quote does not charge a card. The guest explicitly opens a separate Razorpay payment step. Paid quotes must be at least ₹1.

Payments use a durable `stayQuoteOrders` identity per booking/request/quote version. Retrying uses the same order. The existing payment worker recovers interrupted creation using the unique receipt and reconciles captured payments; ambiguous failures never create replacement orders. Signed webhooks and signed guest callbacks both verify amount, currency, order, active booking, quote version and expiry. A global payment attempt receipt makes duplicate callbacks/captures idempotent. Captures after cancellation, expiry, withdrawal or price change are queued for full refund instead of confirming a service. Provider failures or dismissal leave the request Awaiting payment and allow retry.

Supplemental payments are deliberately separate from the original booking payment ledger: `stayPaymentReceipts` and `supplementalPayments` expose paid/refund-pending/refunded amounts. The itinerary, reservation inspector and printable receipt display them separately; the payment receipt lists additional paid extras separately, with their payment references and refund status. Free preferences and unpaid requests are excluded from the receipt. This preserves room balances and avoids refunding a separate payment against the room's original Razorpay capture.

On booking cancellation, outstanding requests close atomically. Paid separately quoted services that are not Fulfilled receive a full refund to their own payment ID; fulfilled services remain charged. This policy is displayed alongside every quote. Original room/immediate-extra cancellation policies remain unchanged. Legacy upfront-paid approval declines retain the original line credit and deterministic refund behavior. The existing refunds worker handles provider idempotency, leases, retries and reconciliation; quote refunds update only the supplemental ledger, leaving the original payment totals untouched.

## Arrival, management and authorization

The live itinerary and Reservations inspector show requests, saved guest inputs, preparation status, hotel responses, quotes, acceptance and payment status. Staff retain manual Preparing → Ready → Fulfilled controls once a request is confirmed. A separate Actions & Audit history shows actors, timestamps, decisions, quote scope and amounts. Mutations create detailed booking events and meaningful decision/payment events use the existing notification outbox. Screens refresh through the existing polling/focus behavior.

Pre check-in retains existing expected-arrival, guest review, notes, free sibling eligibility and paid commitment preservation. Existing free commitments keep saved terms; increases require the same variant still to be available and free. Paid/quoted/unlisted requests cannot be removed by an ordinary pre check-in save. Preparation locks, deadlines and declined-request restrictions remain. Booking revisions serialize guest/hotel changes and provide a clear refresh/retry conflict response. Guest access requires the booking owner; staff access requires active membership of that booking's property. Offering/image writes require the property owner.

## Storage, setup and compatibility

No live data migration, deployment or automatic catalog update is performed. Existing bookings remain readable, and legacy offerings inherit their original per-item-per-stay pricing until an owner edits them. Existing category values are mapped on read. Older API clients omitting additive offering fields preserve saved metadata.

New additive APIs:

- `POST /api/bookings/[bookingId]/stay-requests`: unlisted request creation and guest quote acceptance/decline.
- `POST /api/bookings/[bookingId]/stay-quote-payment`: create/reuse accepted-quote session or verify its signed result.
- `GET/POST /api/partner/bookings/[bookingId]/stay-requests`: authorized decision/quote actions and audit history.
- `POST /api/partner/properties/[propertyId]/stay-image`: owner image upload.
- `GET /api/stay-images/[propertyId]/[imageId]`: authorized draft/public active-offering image delivery.

The original personalization discovery, catalog, pre check-in and preparation APIs remain. New server-only records are `stayQuoteOrders`, booking `stayPaymentReceipts`, and property-scoped `stayImages`. Browser Firestore access remains denied. Queries use existing booking-worker indexes or single-field indexes; no new compound index is needed.

Deploy the updated web app **and rebuild/restart the booking/background workers** together. Reuse production Razorpay credentials and the configured signed `payment.captured` webhook at `/api/webhooks/razorpay`. Keep booking payment reconciliation, refund and notification workers running. Images need the existing private R2 configuration and write/read credentials. No new provider is required. Owners should review template prices, inclusions, trip tags, room applicability and pet policy before publishing.

## Verification

- `npm test`: unit/domain/API tests, including six pricing units, category compatibility, shortlist cap, required inputs, inclusion/pet gates, quote versions and upload validation.
- Isolated Firestore emulator (`demo-helpkey-bookings`, Java 21+) with `tests/stay-transactions.emulator.test.ts` and `tests/booking-transactions.emulator.test.ts`: real transactions, legacy paid commitments, shared limits, deposits, authorization, concurrent mutations, quotes, accepted payments, late capture, interrupted order recovery, cancellation and provider-idempotent refunds. Provider responses are mocked. Never point these tests at live Firebase.
- `npm run test:e2e:stay`: actual checkout, owner, itinerary and partner components served with mocked HTTP services, at 390, 768 and 1366 px. Includes large catalogs, stage preservation, templates, images/failures, variants/choices, quote acceptance and payment retry. Screenshots/traces in ignored `test-results/stay`.
- `npm run typecheck`, scoped ESLint, `npm run build -- --webpack`, and worker compilation.

These checks do not claim live Razorpay charging, live R2 delivery or production notification delivery. No real guest or hotel records are modified during verification. AI recommendations, stock checks, staff assignment and automatic manual-request decisions remain out of scope.

### Verified in this workspace (26 October 2026)

- Full Vitest run: **287 passed, 57 skipped**. Skips cover emulator/provider/queue suites requiring their own environment.
- Separate isolated Firestore run: **36 passed**, with mocked Razorpay responses.
- Browser suite: **18 passed**, with real components and mocked HTTP/provider boundaries, including mobile/tablet/desktop.
- Focused final agreement/label checks: **38 passed**; discovery route check: **1 passed**.
- Scoped ESLint has no errors or warnings in the stay feature, checkout/itinerary/receipt, image/request routes, discovery test and search map. Existing unused-variable warnings in the broader reservation/bookings files remain outside the focused fixes.
- TypeScript, production webpack compilation and worker builds passed. Live provider/storage/notification delivery was not exercised.

## Partner workspace: offerings and guest requests

Stay Customizations now has two tabs. Offerings provides catalog-wide Active/Paused counts, search, normalized categories, name/effective-price sorting and paused duplicate drafts. An accessible responsive drawer groups details, pricing/guest options and eligibility, with a guest preview, explicit review, field errors and unsaved-change protection. Version conflicts retain the edited draft; loading the latest version requires an explicit discard decision. Existing booking snapshots remain unchanged when an offering changes or pauses.

Catalog GET now returns `canManage`; active property members can read the catalog, but saving offerings and uploading images remain owner-only. The Guest requests tab is available to active property members, using existing booking decision, quote/payment and preparation rules. No shared stock or service-slot reservation is introduced.

`GET /api/partner/properties/[propertyId]/stay-requests` accepts `from`, `to`, optional `status` (`open`, `approval`, `waiting`, `todo`, `preparing`, `ready`, `completed`, `all`) and an optional signed `cursor`. Dates select **overlapping stay dates**, not request creation or service dates; the default is today through six days ahead in the property's timezone, with a maximum 31-day range. Each response scans at most 200 bookings and returns matching request rows, timezone, scanned count and `nextCursor`. Empty result pages can still have a continuation; the interface offers Load more bookings and does not claim global request totals. Cursors are bound to user, property, dates and status. This reuses the existing property/checkIn/checkOut descending booking index; no additional composite index or data backfill is needed.

The queue refreshes every 30 seconds while visible and on focus. Request details fetch the current booking revision and reuse the shared approval/quote/preparation controls and booking audit history. Unsent form values survive action errors; server-side revision conflicts force a refresh before another attempt. Completed/cancelled reservations are read-only; unfinished requests on closed stays appear only in history views, not open work. Online agreement and payment requirements remain enforced by existing transactional services.

Verification adds catalog/status tests, isolated emulator tests for bounded pagination/filter-bound cursors/property access, and browser coverage of mobile/tablet/desktop catalog filters, duplication, draft protection, conflicts, staff access and preparation transitions. Tests use fixtures or `demo-helpkey-bookings`, never live guest records.
