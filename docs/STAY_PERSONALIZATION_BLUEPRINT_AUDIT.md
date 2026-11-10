# Stay personalization: November blueprint gap audit

Reviewed: 10 November 2026. Application: `/Users/zrf/ABHI/Freelance/Helpkey/web`.

## 1. Conclusion

Helpkey has a substantial working foundation. Extend it; do not rebuild checkout, booking inventory, request agreements, payments or receipts. The main remaining work is a richer offering model, restoration of owner configuration controls, discovery across all three guest stages, stock/service capacity, and operational visibility.

The existing internal stay specification describes an October implementation. The supplied 26-page blueprint is version 1.0 dated 7 November 2026 and adds requirements that the October specification explicitly excluded, including stock/capacity and team assignment. Existing documentation is not evidence that these new requirements are complete.

There are also current editor regressions relative to the older internal documentation: review acknowledgement does not gate save, closing can discard a dirty form, and several backend-supported fields are not editable in the current UI.

## 2. Scope and evidence limits

Read all 26 pages of the supplied blueprint, including its checklist, seven advanced controls, acceptance criteria, phased roadmap and final definition of done. Visually inspected the PDF's editor/journey illustrations and the three supplied screenshots. Inspected web routes and the relevant customer checkout, itinerary, arrival, receipt, partner catalog, request queue, reservation inspector, platform admin, stay services, booking transactions, notifications, payment/reconciliation/refund integration, schemas and tests.

This is a requirements and implementation audit of stay personalization across the web project. It is not a claim that every unrelated application feature or production deployment has been certified. The separate `/app` mobile project was not requested for implementation and is outside this audit.

No live hotel or guest data was queried or changed. No real charge, refund, message or deployment was triggered. Existing uncommitted booking/mobile recovery changes were present when review started and were left untouched. The attached document is a requirements reference, not authorization to execute its deployment or operational instructions.

Verification results and limitations are recorded in section 12. Repository source, rather than claims in existing Markdown documentation, determines the statuses below.

## 3. What already exists and should be retained

| Capability | Current evidence | Assessment |
| --- | --- | --- |
| Optional three-stage checkout | `components/booking/booking-checkout.tsx`, `checkout-journey.tsx` | Guest details, personalization, review/payment; supports continuing without extras. |
| Optional explicit trip choice | Checkout and `TravelerChips` in `components/stay/personalization-picker.tsx` | Does not infer Couple from guest count. Currently a single choice. |
| Searchable template starter | `lib/stay/templates.ts`, `TemplateLibrary` | 15 code-defined templates; applying a template populates a local form and does not immediately persist it. |
| Property-owned catalog | `lib/stay/catalog.ts`, `service.ts`, partner catalog API | Active/paused offerings, owner writes, property membership reads, version conflicts. |
| Catalog management | `components/stay/partner-customizations.tsx` | Cards/table, search, category/status filters, price/name sorting, edit, duplicate and pause. Duplicates are paused. |
| Guest search and filtering | `checkout-extras-catalog.tsx` | Recommendations, Browse all, search, category dropdown, free/paid/selected filters, selected removal chips. |
| Optional images | Offering fields and property image upload / stay image delivery routes | Existing image processing and property-scoped delivery should be reused. Illustrative labels and icon fallbacks exist. |
| Response compatibility | `lib/stay/response.ts`, `contracts.ts` | Backend supports yes/no, single, multiple and text, with legacy adapters. Current editor does not expose the full contract. |
| Prices and variants | `lib/stay/pricing.ts`, `domain.ts` | Variant price overrides, inheritance, explicit zero/free; server calculation in quote and reservation transaction. |
| Six billing units | `pricing.ts` | Item, person, night, stay, hour and package. A distinct service/session unit is absent. |
| Approval before charging | `domain.ts`, `requests.ts`, `agreements.ts` | New approval requests excluded from checkout payable; hotel approves free or offers a price/quote. |
| Explicit quote acceptance/payment | `requests.ts`, `payments.ts`, `request-agreement-controls.tsx` | Versioned scope/conditions/expiry; explicit guest acceptance; separate Razorpay session. |
| Payment recovery and refunds | Stay payment service plus booking processing/workers | Durable order identity, provider capture checks, idempotent receipts, late capture refund path and separate supplemental ledger. Live provider behavior was not exercised. |
| Saved agreements | `domain.ts`, booking creation in `lib/bookings.ts` | Copies names, text, option/inclusion text, inputs, price and relevant request rules. Catalog edits do not simply rewrite previous requests. |
| Arrival management | `components/stay/pre-checkin.tsx`, `patchArrival` | Guided arrival draft/review flow, unknown arrival choice, independent arrival save. |
| Request tracking/fulfilment | `stay-request-list.tsx`, request queue, reservation workspace | Approval, quote/payment, Preparing, Ready, Fulfilled, staff history, polling/focus refresh. |
| Authorization | Stay services, partner membership checks, Firestore rules | Guest ownership, active property membership and owner-only catalog writes. Browser access to operational Firestore data denied. No department-level boundary yet. |
| Existing room inventory | `lib/booking/inventory.ts`, booking transaction | Room availability allocation exists. It does not reserve pillows, cots, packages or service slots. |

## 4. Blueprint requirements mapped to current implementation

Status meanings: **Present** = substantial implementation exists; **Partial** = some behavior exists but does not meet the full requirement; **Missing** = no implementation found in the audited paths. Present does not mean production integrations were exercised.

| Blueprint requirement | Status | What remains |
| --- | --- | --- |
| Separate offer type, category, profile, occasion, response, price, stage and eligibility (pp. 2-5) | Partial | Schema has three `kind` values and response/form fields; no independent six-type field, occasion field or stages. Editor additionally mixes product nature with selection behavior. |
| Six offering types (p. 5) | Missing as specified | Add Item/amenity, Food/beverage, Staff service, Room preference, Experience/setup and Package/bundle as independent types. Preserve old `kind` compatibility. |
| Twelve standard guest categories (p. 6) | Partial | Current list has 15 modern categories plus two legacy codes. Merge Business/Technology in guest navigation, separate Romance, rename Food, and remove Other as a primary browsing destination. Keep legacy records readable. |
| Celebrations and Romance always separate (pp. 1, 6, 10) | Missing | Current `celebrations` label is literally **Celebrations & romance**; no romance category ID. Requires schema, editor, templates, icons, filters and explicit legacy review. |
| Deep India-first template library (pp. 7-10) | Partial | Only 15 starter templates, including two cake templates. Missing most family, practical essentials, Indian food and dedicated romance examples. |
| Templates begin as drafts (pp. 2, 15) | Partial | Template application is local/unsaved; initial offering status is active, and new-form save is Publish Extra. No explicit draft status/save workflow. Paused records can be a compatibility bridge. |
| Multiple priced variants (p. 11) | Present for price | Variant names, prices and plain inclusion text exist. Add the independent variant fields listed below. |
| Per-variant description/unit/status/image/quantity/availability/stock (p. 11) | Missing beyond inclusion text and price | Variant schema only supports ID, name, inclusion string and optional override price. Unit/quantity/availability currently belong to the whole offering. |
| Independent maximum distinct choices and maximum quantity (p. 12) | Partial | One shared `maxQuantity` field changes meaning by response mode. Cannot express two distinct add-ons with three units each independently. The current choice editor also lacks a visible limit input. |
| Guest notes (p. 13) | Partial | Label and required flag plus server validation exist. Add placeholder, configurable limit, explanatory/privacy copy and conditional display. Current guest cap is fixed at 500 characters. |
| Additional no-price choices (p. 13) | Partial | Backend and guest rendering support required/optional single-select groups. Current owner editor has no choice-group editor. |
| Multi-select additional choices and priced modifiers (p. 13) | Missing | `choices` is a string per group; no group response mode, selection caps or price adjustments. |
| Service scheduling (p. 13) | Partial | Raw date/time, within-stay validation, notice, people and whole service hours exist. Add open windows, actual slots, cutoff, blackout dates and duration/capacity. |
| Service-time lead time (pp. 13, 17) | Partial | Catalog eligibility/deadline is anchored to booking arrival, even for a service requested later in the stay. |
| Structured package components/upgrades (p. 14) | Partial | Per-variant inclusion text exists and is displayed/saved. No component IDs, quantities, optional/included status, component images, upgrade prices or shared stock. |
| Avoid charging twice for package inclusions (pp. 14, 23) | Partial | Room/rate amenity matching exists. It does not model or detect the same component in a package and a separately selected offering. |
| Basic room/stay rules (p. 14) | Present | Room IDs, hourly/overnight eligibility, lead time, pet policy and included-amenity checks exist. |
| Advanced ALL/ANY eligibility (p. 14) | Missing | No grouped rules, date ranges/weekdays/blackouts, stay-length bounds, children/age compatibility, stage rules or inventory criteria. Recommendation rules must remain distinct from hard eligibility. |
| Short conditional editor/wizard (pp. 15, 22) | Partial | Template chooser and numbered sections exist; current editor is still one long expanded form. Missing independent configuration controls must be restored, not removed. |
| Live guest card and complete form preview (pp. 15, 26) | Partial | Interactive selection simulator exists, but does not reproduce the whole guest card with image/description/confirmation/inclusion detail. It remounts on every draft change and assumes Asia/Kolkata. |
| Up to two trip profiles plus a separate occasion (p. 17) | Partial | Checkout passes `single` to trip chips. No separate occasion, Leisure or Pet traveller discovery profile. |
| Around four recommendations (pp. 17, 19) | Partial | Default shortlist is eight, hard cap ten. Uses profile match, base-price free preference and category diversity/alphabetical order. No occasion/context/featured/performance signals. |
| Category chips and clear guest actions (pp. 17-18) | Partial | Category dropdown exists. Simple Add/Request exists, but details-bearing offerings use generic Choose options, including quote/scheduled offerings. No separate quote filter. |
| Clear selected/review summary (pp. 18, 22) | Present with gaps | Review displays pending approval, inclusions, note and extra choices; sidebar is compact. Need distinct paid/pending/quote grouping, service time timezone consistency and full mobile request summary. |
| Checkout + pre-arrival + in-stay catalog (p. 17) | Partial | Checkout catalog works. Later stages support existing requests and unlisted requests, not a connected full new-offering browser with stage-aware purchasing. |
| Personal link and QR access (p. 17) | Partial | Authenticated web itinerary exists without an app install. No stay-specific WhatsApp/SMS/email campaign or booking-scoped QR entry flow found. Authentication must remain secure. |
| Request/payment lifecycle (p. 21) | Present with gaps | Request status, settlement and quote payment status are separate. Explicit request expiry, richer payment outcomes and post-confirmation individual service cancellation need extension. |
| Correct department routing/need-to-know details (p. 21) | Missing | All active property members can access booking request details; no team/assignee fields or department queues. |
| Atomic stock/capacity (pp. 21, 23) | Missing | No extra stock, slot or daily-capacity documents/reservation/release logic. Per-booking quantity is not shared inventory. |
| Guest status notifications (p. 21) | Partial | Durable in-app notification outbox exists. Copy is generic; sends to guest plus all active property members. No stay-specific external channel delivery or department routing. |
| Actor/timestamp audit (pp. 21, 26) | Present | Booking events record staff/guest actions, transitions, scope and amounts; partner history reads the most recent 50 events. |
| Platform-wide operational visibility | Partial | Admin booking/payment timeline exists, but no proper request inspector or extras oversight screen. Scope this as support/read visibility, not an automatic expansion of staff editing permissions. |
| Activation/discovery/conversion/fulfilment analytics (p. 24) | Missing for this feature | Basic room/booking finance and service collections exist. No per-offer views/clicks/selections/approval/fulfilment funnel or profile/occasion conversion dashboard. |
| India localization (p. 22) | Partial | INR/en-IN and per-property timezone already used widely. Fix checkout review service-time rendering and preview timezone; add India-first templates and configurable note/dietary copy. Translation UI is later scope. |

## 5. The seven mandatory advanced controls

These should be independently configurable and progressively revealed. They must not become four mutually exclusive "extra types".

| Control | Backend today | Owner UI today | Required change |
| --- | --- | --- | --- |
| Maximum choices | Shared `maxQuantity` only | Quantity input only for standard items; no independent choice limit | Add `maxDistinctChoices` separate from quantity and variant limits; show all relevant controls. |
| Multiple custom prices | Supported | Choice/package price rows | Preserve inheritance/free semantics; extend variant unit/availability/inclusions/limits. |
| Guest note | Label and required supported | Label and required supported | Add hint, field character limit and conditional applicability. Keep text response independently selectable. |
| Additional choices | Single-value groups only | No current group editor | Restore group editor; add single/multiple, min/max selections and priced options. |
| Scheduling | Basic date/time and flags | Separate scheduled type | Allow scheduling alongside packages, cake sizes and modifiers; add windows/slots/cutoffs/blackouts. |
| Package inclusions | Plain string per variant | Textarea | Structured components, quantities, optional upgrades, snapshots and duplicate-charge awareness. |
| Advanced eligibility | Room/mode/notice/pets | Simple room/mode/profile sections | Add separate visibility and eligibility groups, ALL/ANY rules and readable summary. |

## 6. Confirmed current implementation issues

### A. Review checkbox does not protect publication

`components/stay/partner-customizations.tsx`: `reviewed` is initialized and rendered but never tested in submit or button disabled logic. Choosing a template sets it false, but a valid form can still publish without acknowledgement. The older specification's explicit review claim is therefore inaccurate for the current source.

Fix: require explicit review at activation, reset it on material changes, and make Save draft and Activate distinct actions. Do not confuse this UI acknowledgement with server authorization.

### B. Closing can discard an unsaved owner form

The editor computes `dirty` and installs a browser `beforeunload` handler, but `requestClose` calls `close()` directly. Cancel or drawer close does not use the dirty state. Browser unload protection does not protect an in-app close.

Fix: keep draft/continue editing/discard choices for Cancel, close, Escape and navigation as appropriate; disable close during uploads/save. Reuse the existing arrival editor's established draft-guard pattern where useful.

### C. Switching extra type clears valid configured data

`OfferingFields.handleTypeChange` sets `variants: []` when switching to Item or Scheduled, and sets `timeRequired: false` when switching to choice/package. Changes happen immediately. The later submit confirmation cannot protect options already discarded in the draft.

Fix: separate offer type, response, package configuration and scheduling; preserve inactive draft configuration; confirm explicitly before destructive changes. A cake/package must support variants, flavour and delivery time together.

### D. Several supported controls have become inaccessible

The backend supports text/custom form types, choice groups and amenity relationships. The current owner form offers Standard Item, Choice/Variations, Curated Package and Scheduled Service. It has no additional choice-group editor, explicit hotel-quote creation control or included-amenity relationship editor. It also derives `kind` from category selection in one branch.

Fix: restore these capabilities as independent controls. Saved legacy data may still render correctly, but an ordinary hotel owner cannot configure the full contract through the current form.

### E. Pre-arrival options are returned but not connected to a catalog UI

`guestStayOptions` returns eligible zero-price offerings (or offerings with a free variant) only for confirmed bookings. The current `PreCheckinPanel` fetches arrival metadata and renders arrival details, existing requests and an unlisted request form. It does not mount a picker for adding these returned offerings. The `PersonalizationPicker` function has no importing call site for this purpose; its `TravelerChips` export is used elsewhere.

Fix: add a dedicated booking-linked catalog and request creation flow, separate from arrival submission. Support paid, free and quote requests with the established agreement/payment rules.

### F. Arrival-based deadlines prevent ordinary in-stay catalog requests

`offeringUnavailableReason` requires `now < startAt - notice`. Even a zero-notice towel request fails at or after arrival. `guestStayOptions` also requires booking status `confirmed`, excluding `checked_in`. Unlisted requests and existing quote payments do support checked-in bookings, so the journey is inconsistent rather than wholly absent.

Fix: compute deadlines against the relevant service/delivery time for in-stay requests, enforce current booking stage and booked departure, and retain arrival deadlines for services explicitly prepared before arrival.

### G. Service-time formatting is inconsistent

Checkout review formats `r.inputs.serviceAt` using `toLocaleString("en-IN")` without the property timezone. Other request displays correctly pass `timeZone`. The preview hard-codes Asia/Kolkata rather than receiving the property's timezone.

Fix: use one shared property-time formatter and label the timezone in preview, selection and review.

### H. Admin totals do not tell the whole extras story

Admin list summary sums booking `paidPaise`, while separately captured quote payments intentionally live outside that original booking balance. Admin timeline can retrieve payment attempts, including stay quote captures, but its UI only presents generic IDs/status/amounts and raw event labels. It does not explain request, quote version, separate extras balances or refund scope. Partner dashboard finance already recognizes `stayQuote` service collections; preserve and build on that distinction.

Fix: show original booking collections, supplemental extras collections and refunds separately, with a request-linked inspector. Do not merge supplemental charges into the original room payment/refund ledger.

### I. A required note can be configured without a visible guest field

The owner can enable `noteRequired` while leaving `noteLabel` blank. Validation requires the note, but `GuestInputFields` displays a textarea only for a nonblank label, a text response or a custom quote form. A standard item with only `noteRequired: true` can therefore block selection without providing a place to answer.

Fix: render the note when it is required, with a clear fallback label, and validate owner configuration consistently. Required information must always be reachable in the guest form.

## 7. What the supplied screenshots reveal

These observations refer to the submitted screenshots, not a live query of that hotel's catalog.

1. **40 of 49 offerings are classified Other/special request** in the partner screenshot, with seven Room preferences and one each Celebrations and Food. That is a categorization/data-quality problem as well as a UI problem. A better browser needs correctly categorized offerings. Review mappings with the owner; do not infer all classifications and silently rewrite live data.
2. **49 active and zero paused** is shown. This does not prove all templates were auto-published. It does mean the property should review what it genuinely supplies, notice, price, room compatibility and confirmation settings before promotion.
3. **The displayed first recommendations are practical free items in alphabetical order**, such as clothes hangers and desk lamp. That aligns with the current free-first/alphabetical ranking. With no explicit matching profile, generic essentials dominate; there is no birthday/honeymoon signal.
4. **"8 available" is the visible shortlist size**, not necessarily the total eligible property catalog. Label it "8 recommendations" and show the real eligible count alongside Browse all. This prevents guests thinking the remaining catalog is absent.
5. **The guest category dropdown is less discoverable than the requested chips.** Show useful eligible category chips, including distinct Celebrations and Romance, and put rare categories behind More. Do not display dead/empty categories just to fill the screen.
6. **Trip preference is placed before required guest identity details.** Keep it optional and compact; repeat or expose editing near recommendations so the effect is visible. Allow two profiles and an independent occasion without adding another mandatory step.
7. **The booking summary already communicates room cost, taxes, extras and payable amount.** Retain it. Add separate selected groups for pay-now extras, pending hotel decisions and quotes, rather than redesigning payment behavior unnecessarily.

## 8. Proposed experience by role

### Hotel owner

Library: search by everyday names and category; Popular templates; category coverage; configure selected templates as drafts. Separate reusable Helpkey templates from what this property has activated. Do not create a live hotel offering just because a template exists.

Editor: Basics → Price & response → Personalization & schedule → Availability & audience → Preview & activate. Keep short, conditional fields; let owners jump between sections. Place advanced limits/rules in named accordions. Use sticky Save draft and Activate actions, field errors, dirty-form protection and a visible summary of who can request the offering and when.

Example: one cake offering with size prices, independent flavour/dietary choices, message field and delivery slots. One birthday setup with Basic/Classic/Premium inclusions. Romance appears separately. Owners should not have to enumerate every size × flavour × delivery-time combination as a separate product.

### Guest at checkout

Keep existing three-step checkout. Optional profiles/occasion → four useful recommendations → eligible category chips → Browse all with search and Free/Paid/Hotel quote/Selected. Cards show image/icon, short description, clear unit, confirmation/timing and behavior-specific action. Details disclose inclusions, modifiers and restrictions.

Use Request for approval items; Add for fixed-price immediate purchases; Choose time for scheduled services; Request a quote for custom-priced services. Preserve selected items when filters change. The mobile sticky action already exists; enhance its selected summary with count, payable amount, pending count and a sheet showing details/removal, rather than adding a second competing sticky bar.

### Guest after booking and during stay

Use the same secure booking portal for Discover extras and My requests. Keep arrival form separate. Show pre-arrival preparation offers before arrival and quick essentials/services while checked in. Do not require an app install. Offer booking links/QR with login or a properly scoped access mechanism; never use a confirmation code alone as authorization.

Track request decision, quote acceptance/payment and fulfilment separately. Preserve explicit acceptance and verified payment. Show expected time, next action, hotel contact and reasons for declined/expired/unavailable requests.

### Hotel staff

Keep the working request queue and reservation inspector. Add department/assignee, service due time, overdue/unassigned filters and request-specific notifications. Date filters currently mean overlapping stay dates, not scheduled service dates; provide an explicit service-date view for kitchen/housekeeping planning. Do not relabel the existing filter as a delivery schedule.

Restrict staff detail views to what their team needs. Keep front office oversight where authorized. Store assignment/fulfilment audit and release reserved stock/capacity using clear cancellation/no-show/completion rules.

### Helpkey platform admin

Add a read/support view of property offerings, request state, quote history, separate payments/refunds and audit. Highlight incomplete configuration, uncategorized catalog rows and failing notification/payment jobs. Global template/category administration is a useful extension of the shared library, but the blueprint does not explicitly require a full template CMS for initial delivery; code-defined templates can remain a first implementation.

Do not grant platform admins arbitrary guest-request mutation merely to make the dashboard more informative. Add explicit permissions only for concrete support actions.

## 9. Data/backend changes needed before visual polish can satisfy the brief

1. **Versioned additive offering schema:** independent six-value offer type, stable category IDs, profile/occasion tags, display stages, explicit draft/active/paused lifecycle and template reference. Keep the old `kind`, category aliases and old request behavior readable through adapters.
2. **Separate limits:** maximum distinct selections, total quantity per booking and optional per-variant quantity. Validate on server across sibling requests, not just each browser card.
3. **Richer variants:** own unit, description, active status, image, inclusions, stock/capacity/availability and limits. Use stable IDs. A default/override model can reduce owner input.
4. **Modifiers:** typed single/multiple groups with required/min/max selections and priced options. Calculate price adjustments on the server, display before acceptance and include them in quote fingerprints and request snapshots.
5. **Structured packages:** component identity/name/quantity/included/optional/upgrade data and snapshot. Warn when a separately added component overlaps an included one; allow a deliberate additional item. Aggregate component demand against shared stock where applicable.
6. **Schedule rules:** property-local operating windows/slots/cutoff/blackouts/duration, stage-aware lead-time anchor, valid service periods and explicit unavailable reasons. Share validation between discovery, quotation, confirmation and staff rescheduling.
7. **Eligibility rules:** separate discovery preference/visibility from hard eligibility; evaluate ALL/ANY rules server-side with an explanation. Never let a recommendation override a safety/stock/room restriction.
8. **Extras inventory:** property/variant/component or service-slot inventory records; transactional reserve/commit/release. Decide reservation timing around approval and unpaid quotes, lease expiry and payment. Recheck on confirmation; late captures must not confirm unavailable service. Room inventory code is a pattern, not a substitute.
9. **Booking-linked creation:** add catalog request creation after booking, rather than abusing arrival save or unlisted text. Reuse versioned request agreements and supplemental payments. Include idempotency for repeated guest submits and revision conflicts.
10. **Operations/read model:** request ID, booking link, category/type/stage snapshot, service due time, team/assignee and timestamps. Existing requests are embedded in booking arrays and queue pages scan bookings. Consider a transactionally maintained request projection/collection for due-time queries and analytics; keep the booking agreement authoritative during transition. Budget any needed indexes explicitly.
11. **Notifications/access:** meaningful request ID/name/status/next-action messages; team-aware recipients; external channel adapters and delivery preference/outcome where required; audit and safe booking links.
12. **Analytics events:** eligible impressions, detail opens, selections, submissions, approvals/declines, captured/refunded value, preparation/completion timestamps and cancellation reasons. Build per-offer and property reports before performance-based ranking. Avoid logging note contents as analytics payloads.

Old offering edits must not overwrite saved requests. New fields cannot be silently stripped by older clients. Catalog reclassification needs an explicit dry-run mapping and owner review, especially for the currently merged celebrations category: its old ID does not prove whether each row is Celebration or Romance.

## 10. Recommended delivery order

| Batch | Deliverables | Acceptance gate |
| --- | --- | --- |
| 1. Restore owner reliability and correct taxonomy | Review gate; dirty-close guard; nondestructive type changes; accessible field labels; restore choice/quote/response/amenity controls; separate Romance; legacy mapping proposal | Owner can configure cake sizes + flavour + message + time without losing settings; draft stays unpublished; old requests unchanged. |
| 2. Complete core configuration | Independent six types, profiles/occasions/stages, separate limits, richer variants, modifiers, structured packages | Birthday Basic/Classic/Premium and couple welcome bundle work with correct itemized totals/inclusions. All seven advanced controls can be configured. |
| 3. Eligibility, scheduling and availability | Shared server rules, slots, date/occupancy rules, atomic extra stock/capacity, cancellation release | Two guests cannot confirm the last cot/slot. Invalid dates/windows/notice rejected at every mutation boundary. |
| 4. Full guest journey | Four recommendations, category chips, profile/occasion editing, booking-linked pre-arrival/in-stay catalog, behavior-specific actions, mobile selected summary | Same offering can appear in one/two/all three stages; new free/paid/quote requests work after booking and while checked in. |
| 5. Staff/admin visibility and communication | Team assignments/permissions, service-date queue, overdue/unassigned states, useful notifications, support inspector and separate finance | Correct team receives only needed detail; guest sees status/next action; admin can trace extra charge/refund to request and quote. |
| 6. Insights and tuning | Activation/setup metrics, offer funnel, approval/fulfilment/revenue/cancellation reports, featured/context/performance ranking | Reports reconcile to captured/refunded payments and recorded request events. |

AI and destination-tour marketplaces remain outside the required core. Performance ranking should follow real event collection; do not invent popularity. Loan return instructions/flags and compatibility metadata should be added with the relevant item templates, rather than hidden in generic descriptions forever.

## 11. Blueprint acceptance scenarios that must be added or strengthened

| Scenario from p. 23 | Current coverage/readiness | Required verification |
| --- | --- | --- |
| Couple + birthday | Profile ranking exists; separate occasion/Romance absent | Verify both categories stay distinct and birthday tiers price correctly. |
| Couple + honeymoon | Missing occasion and dedicated templates | Honeymoon promotes Romance; never forces birthday. |
| Family with baby | Basic Family tags/room restrictions only | Active offering, cot/bed compatibility, relevant guest context, notice and last-unit stock. |
| Business | Basic profile match | LAN compatibility, printing tiers, breakfast timing, adapter loan/return. |
| Solo/no profile | Existing general shortlist/Browse all | Four useful general recommendations and access to every eligible offer. |
| Multiple prices | Domain tests and browser tests exist | Extend to variant unit/inclusions/status/availability/limits; repair current owner test selectors. |
| Max selections | Shared cap tested | Distinct choice cap separately from quantities, across repeat requests. |
| Required/optional note | Existing backend tests | Restore all editor response modes; test label, hint, cap and conditional visibility. |
| Additional choices | Single groups supported in guests | Owner-configured multi-select and priced modifiers with correct snapshot/totals. |
| Scheduling | Basic service-time tests | Windows, slots, cutoff, blackout, service-based notice and timezone. |
| Package inclusion | Inclusion text saved | Structured quantities/upgrades and deliberate-versus-accidental duplicate component charging. |
| ALL/ANY eligibility | Missing | Nested combinations, visibility versus hard eligibility, clear rejection reason. |
| Three journey stages | Checkout browser covered | Full new-catalog request at pre-arrival and checked-in stages, including independent paid extras. |
| Manual approval + paid | Domain/payment paths exist | Keep no premature charge, exact acceptance, capture verification and stock commit. |
| Hotel quote | Existing domain/emulator/browser tests | Preserve quote version/expiry, retry/reconcile and late capture refund behavior. |
| Last-item race | Room inventory tests are not extra-stock tests | Concurrent bookings/approvals/payments cannot reserve the same final unit/slot. |
| Edit offering after request | Existing saved agreement tests | Include new modifier/component/schedule snapshots and legacy compatibility. |
| Pause offering | Existing behavior/tests | New discovery stops; previous confirmed service remains valid and stock stays correct. |

Additional regression gates: closing or changing owner type must not lose data; unchecked review cannot activate; all guest inputs have associated labels; keyboard focus and one-column mobile cards; request mutation authorization per property/team; admin finance does not mix original booking and supplemental payments.

## 12. Verification in this review

- `npm test -- --reporter=dot`: **55 test files passed, 9 skipped; 384 tests passed, 96 skipped**. The skipped suites include integrations requiring emulator/provider/queue environments; they are not passed validations.
- `npm run typecheck`: passed.
- `npm run test:e2e:stay`: fixture server initially blocked by local socket sandbox; after allowing local execution, the configured Playwright Chromium revision 1254 was missing. Those 37 browser-launch failures were environmental, not 37 demonstrated product failures.
- A second browser audit used the already installed Chromium revision 1248, an isolated temporary configuration, the same mocked HTTP/component fixture, and a 12-second per-test timeout: **19 passed, 18 failed, 3.6 minutes**. All 18 failure endpoints were missing locators: seven awaited the old Create offering button, six awaited the old Guest requests label, four awaited an accessible Name field and one awaited Variant 1 custom price. Current buttons are Add Extra and Guest Requests Queue; several current field labels are visually adjacent rather than programmatically associated. These results expose stale test contracts and accessibility gaps; they are not proof that 18 underlying operations are broken. Passing scenarios cover checkout navigation/search/recovery, guest response controls and guided arrival at tested widths. This compatibility run is not the canonical configured-browser release gate.
- Three additional temporary browser reproductions **all confirmed** the identified owner issues: a valid new offering published with the review checkbox unchecked; Cancel discarded an edited name without a prompt; switching Choice → Standard Item → Choice cleared both existing priced variants and replaced them with one blank option. These runs used mocked HTTP and the installed Chromium, without modifying project tests or live records. Their passing assertions confirm the faulty behavior, not that those product requirements are satisfied.
- No emulator suites were started against live Firebase. No live Razorpay, R2 or external notification delivery was exercised. No production build/deployment was performed for this read-only analysis.

The older `docs/STAY_PERSONALIZATION.md` recorded 18 browser passes on 26 October. The current suite has 37 scenarios, and current owner UI labels/controls differ. Do not reuse the old pass count as current release evidence.

## 13. Primary implementation anchors

All paths below are under `/Users/zrf/ABHI/Freelance/Helpkey/web`.

- [Offering contracts and categories](/Users/zrf/ABHI/Freelance/Helpkey/web/lib/stay/contracts.ts)
- [Eligibility, snapshots, totals and transitions](/Users/zrf/ABHI/Freelance/Helpkey/web/lib/stay/domain.ts)
- [Owner saves, pre-arrival options and fulfilment](/Users/zrf/ABHI/Freelance/Helpkey/web/lib/stay/service.ts)
- [Template library](/Users/zrf/ABHI/Freelance/Helpkey/web/lib/stay/templates.ts)
- [Recommendations](/Users/zrf/ABHI/Freelance/Helpkey/web/lib/stay/recommendations.ts)
- [Owner workspace/editor](/Users/zrf/ABHI/Freelance/Helpkey/web/components/stay/partner-customizations.tsx)
- [Current conditional editor fields](/Users/zrf/ABHI/Freelance/Helpkey/web/components/stay/offering-fields.tsx)
- [Guest checkout catalog](/Users/zrf/ABHI/Freelance/Helpkey/web/components/stay/checkout-extras-catalog.tsx)
- [Current arrival/request panel](/Users/zrf/ABHI/Freelance/Helpkey/web/components/stay/pre-checkin.tsx)
- [Quotes and decisions](/Users/zrf/ABHI/Freelance/Helpkey/web/lib/stay/requests.ts)
- [Separate extras payments](/Users/zrf/ABHI/Freelance/Helpkey/web/lib/stay/payments.ts)
- [Property request queue](/Users/zrf/ABHI/Freelance/Helpkey/web/lib/stay/partner-queue.ts)
- [Notification worker](/Users/zrf/ABHI/Freelance/Helpkey/web/lib/booking/notifications.ts)
- [Platform admin bookings](/Users/zrf/ABHI/Freelance/Helpkey/web/components/admin/dashboard/admin-bookings-page.tsx)
- [Browser scenarios](/Users/zrf/ABHI/Freelance/Helpkey/web/tests/e2e/stay-personalization.spec.ts)

This audit proposes changes only. Application implementation and live catalog edits have not been made.
