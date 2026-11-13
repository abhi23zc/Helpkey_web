# Guided mobile implementation checklist

Baseline: [10 November 2026 audit](/Users/zrf/ABHI/Freelance/Helpkey/web/docs/APP_PARITY_AUDIT.md). API lookup: [route inventory](/Users/zrf/ABHI/Freelance/Helpkey/web/docs/APP_API_INVENTORY.md).

This is a proposed execution plan. Unchecked items are work still to implement or verify, not changes made by this audit. Start with the customer app already present. Partner mobile functionality is a separate scope decision.

## Working method for each feature

1. Compare the actual website behavior, API route and service/schema. Use implementation as the reference when older design documents disagree.
2. Record request, response, errors, authorization, money units, timezone and revision/idempotency requirements.
3. Add a mobile parser/model and API function, then query/mutation hooks and native UI.
4. Add focused contract/domain checks for failure modes that can silently lose or misrepresent bookings or money.
5. Verify the customer journey in an installed development build against isolated/staging data, including the same booking opened on the website.
6. Mark completion only after the acceptance criteria pass. Record whether providers were mocked or real test-mode services.

Before changing framework code, follow `web/AGENTS.md` and `app/AGENTS.md`: read the installed Next.js guide relevant to the change and the exact Expo 57 documentation respectively.

## Phase 1 — Correctness and contract alignment

### 1A. Booking statuses and identity

- [ ] Add `checked_in` and `checked_out`; normalize legacy `completed` consistently with the server.
- [ ] Retain valid historical bookings with a missing/deactivated public property slug; use booking ID for detail access.
- [ ] Add property timezone, `startAt`, `endAt`, booking mode, duration and relevant financial fields to mobile booking DTOs.
- [ ] Define in-house, completed, pending, cancelled, expired and no-show presentation from server state and time boundaries.
- [ ] Use the appropriate authoritative action rules; do not expose staff check-in/out actions merely because a serialized action list contains them.
- [ ] Decide how unknown future statuses render without silently removing otherwise valid reservations.

Acceptance: create on web, view on app, check in and out through the partner website, and confirm the same booking remains visible throughout. A property becoming unavailable must not remove access to its saved booking.

### 1B. Prices, selected offers and search filters

- [ ] Retain selected search `offer`, exact totals, cancellation terms, room/rate identity, `evaluatedAt`, `expiresAt`, `total` and facets.
- [ ] Show dated prices as totals for the selected stay; define undated starting-price labels separately.
- [ ] Pass supported price/cancellation/amenity/rating/type filters to the current backend for all sorts.
- [ ] Preserve selected room/rate IDs into hotel detail and explicitly explain if that offer changes or disappears.
- [ ] Retain evaluated rate totals and pay-now/balance fields rather than calculating dated totals from the base nightly price.
- [ ] Refresh at offer expiry using server time; block stale selection during availability refresh.
- [ ] Handle expired/mismatched cursors by restarting the result set with an understandable message.
- [ ] Keep previous search cards inert while new criteria are resolving.
- [ ] Display structured children, pet, smoking, ID, minimum age and additional hotel rules.

Acceptance: compare one-night, multi-night and date-specific-rate totals on web/app; combine rating sort with a budget; choose free cancellation when a hotel has both refundable and nonrefundable offers; expire an offer while its screen stays open.

### 1C. Checkout and cancellation agreements

- [ ] Parse quote `fingerprint`; submit it as `quoteFingerprint` with `expectedTotalPaise` from the quote the guest reviewed.
- [ ] Handle changed quotes by refreshing and asking the guest to review the new agreement before retrying.
- [ ] Align separate booking-contact, guest and applicable identity-input behavior with the website; retain only the server-supported masked identity fields when applicable.
- [ ] Correct cancellation copy using fee, exact deadline, property timezone and current time.
- [ ] Show saved cancellation/refund terms before cancellation; after success distinguish queued refund from completed refund.
- [ ] Normalize machine codes and field errors across old/new envelopes; distinguish changed quote, conflicting idempotency body, in-progress work and lost hold.
- [ ] Preserve an unchanged create request's idempotency key across ambiguous retries. Plan for process restart before a create response is received, not just after SDK payment success.
- [ ] Verify pending-payment persistence failures and serialize overlapping storage updates; keep server reconciliation as the final authority.

Acceptance: change rate/policy after quoting; double-tap submit; lose connection after server creation; dismiss the payment sheet; expire the hold before capture; kill/reopen after SDK success; confirm there is no duplicate booking/charge and no false success label.

## Phase 2 — Overnight booking management and account wishlist

### 2A. Booking detail and receipt

Existing API: `GET /api/bookings/[bookingId]`.

- [ ] Add a booking-ID route, for example `app/src/app/bookings/[bookingId].tsx`.
- [ ] Change “View Details” to open that route; keep “Book Again” as a separate public-hotel action.
- [ ] Parse saved property contact/address, guest names/contact, billing, amenities, room/rate, times/timezone and policy snapshot.
- [ ] Display original total, payable/paid/balance, credits, refunds and supplemental payments in separate sections.
- [ ] Show original room payment and separately paid extras distinctly on the receipt.
- [ ] Implement receipt viewing/sharing using native presentation; determine whether a server PDF/export is needed. Existing web receipt rendering is a browser component, not a ready PDF endpoint.
- [ ] Add owner-only 404/unauthorized/error states and refresh after mutations/foregrounding.

Acceptance: booking made on either client opens on both, including deposit/pay-at-property and cancelled/refund-pending cases. Historical details use saved terms rather than the property's current public listing.

### 2B. Account wishlist

Existing APIs: `GET /api/wishlist`, `PUT /api/wishlist/[propertyId]`, `DELETE /api/wishlist/[propertyId]`.

- [ ] Extend shared mobile HTTP transport with PUT and DELETE while preserving bearer auth, timeout/cancellation, request IDs and error handling.
- [ ] Implement paginated account wishlist and bounded saved-ID lookups for visible cards.
- [ ] Key account data by UID and clear/cancel personal queries on account changes.
- [ ] Add optimistic save/remove with rollback and unavailable-property presentation.
- [ ] Decide guest behavior: sign-in before save, or guest-local saves with explicit account merge. Do not silently attach a previous device user's list.
- [ ] Remove misleading “no wishlist API yet” and “shortlist in sync” assumptions once behavior is defined.

Acceptance: save on app and see it on web; remove on web and refresh app; switch users on the same phone; cancel sign-in during a save; simulate a failed write.

## Phase 3 — Hourly booking end-to-end

Existing APIs: search, property detail/bookable, quote, create, payment, booking detail. No second booking backend is needed.

- [ ] Extend stay/search/navigation types with `bookingMode`, `arrivalTime` and `durationMinutes`.
- [ ] Let hourly stays omit checkout-date input; use the server-computed end date/time, including midnight crossing.
- [ ] Read property booking modes/timezone and `hourlyDurations` from the bookable response.
- [ ] Offer only configured whole-hour prices, 1–24 hours; do not infer missing durations or multiply a one-hour price.
- [ ] Use 15-minute arrival steps and surface operating-window/advance-notice/cleaning constraints from server responses.
- [ ] Support hourly quote `nights: 0`; current mobile parsing rejects it.
- [ ] Carry mode/time/duration through every URL, cache key, quote, submit, retry, confirmation and receipt.
- [ ] Render duration and local start/end instants in booking lists/details; avoid nightly labels.
- [ ] Confirm hourly and overnight inventory contention in isolated transaction tests.

Acceptance: same-day, midnight-crossing, missing duration-price, sold-out, advance-notice, cleaning-buffer, deposit and cancelled hourly cases. An hourly booking created on web must render correctly on mobile even before mobile booking creation is enabled.

## Phase 4 — Stay personalization and pre-check-in

Implement in slices; this feature is larger than an “extras” checkbox list.

### 4A. Checkout discovery and selections

Existing API: `POST /api/bookings/personalization`; selections then go into existing quote/create requests.

- [ ] Add `features/stay/` models/parsers/API/hooks/components.
- [ ] Support traveler preferences, categories, free/included/paid/approval options, variants, choices, quantities, required guest inputs and unlisted requests.
- [ ] Send `customizationSelections`, `travelerPreferences` and `unlistedRequests` through quote and booking creation.
- [ ] Use quote totals and saved agreement snapshots; do not calculate authoritative extras charges on-device.
- [ ] Respect eligibility, inclusion, pet rules, deadlines and selection limits from the backend contracts.
- [ ] Preserve form/selection state across stage navigation and recoverable errors.

Acceptance: guest can distinguish a preference, an immediate charge, an included service and an approval request. Unlisted requests awaiting a hotel quote must not appear as a confirmed free service.

### 4B. Arrival and free post-booking choices

Existing APIs: `GET/POST/PATCH /api/bookings/[bookingId]/pre-checkin`.

- [ ] Load guest stay options and editability, then use current booking `stayRevision` for writes.
- [ ] Use PATCH for arrival-only edits so saving arrival never replaces request selections.
- [ ] Support known arrival time or “unknown,” notes, guest review, save draft and submit.
- [ ] Use POST only for the full pre-check-in selection workflow with its complete required fields.
- [ ] On conflicts, refresh server state, retain unsent input where safe, and require review before retrying.
- [ ] Preserve existing paid/quoted commitments and preparation locks; do not replace the request array from an incomplete mobile model.

Arrival-only PATCH fields are `revision`, `arrivalChoice`, `expectedArrivalLocal`, `notes`, `submit`, `guestsReviewed`. The arrival string is property-local `YYYY-MM-DDTHH:mm`, not a device-local timestamp.

### 4C. Guest requests and separate quote payments

Existing APIs: `POST/PATCH /api/bookings/[bookingId]/stay-requests`, `POST /api/bookings/[bookingId]/stay-quote-payment`, and refreshed booking detail.

- [ ] Show request status, agreed scope/price, hotel response and preparation state.
- [ ] Create unlisted requests, edit eligible selections, and accept/reject the exact current quote version using the current revision.
- [ ] Show scope, conditions, expiry and cancellation terms before acceptance.
- [ ] Treat acceptance and payment as separate actions; accepting must not claim a charge or service confirmation.
- [ ] Adapt native Razorpay presentation to supplemental sessions. This endpoint returns session fields directly, whereas original booking/payment-session responses wrap them in `razorpay`.
- [ ] Recover signed supplemental payment callbacks through the supplemental endpoint, with request/version/order identity; do not use the original booking-payment verifier.
- [ ] Refresh booking detail and supplemental ledger after payment, cancellation, withdrawal or hotel response.
- [ ] Confirm revised/expired/withdrawn/cancelled quotes reject stale payment and display refunds appropriately.

Acceptance: hotel approves a free request; hotel issues a paid quote; guest accepts, dismisses payment and retries; hotel revises/withdraws the quote; capture arrives late; booking cancellation refunds eligible separately paid services without altering the original payment ledger incorrectly.

## Phase 5 — Reviews, notifications and account entry points

### Reviews

- [ ] Add own-review/eligibility GET and create/edit POST/PATCH for `/api/reviews/[propertyId]`.
- [ ] Surface completed-stay eligibility and one-review-per-property behavior.
- [ ] Add native photo selection, SHA-256 checksum, permitted MIME/size validation and signed upload.
- [ ] Upload bytes with the returned signed headers, then call photo finalize. Do not send Firebase bearer tokens to the R2 upload URL.
- [ ] Show private preview/publication progress and upload retry without claiming immediate public availability.

### Notifications

- [ ] Add paginated GET `/api/notifications`, unread count and POST `{ ids }` for read state.
- [ ] Open booking notifications by booking ID and respect authorization after account changes.
- [ ] Refresh on focus and after relevant mutations; define polling behavior.
- [ ] Treat push as separate work: device token registration, permission UX, provider delivery and app-open routing are not provided by the current feed API.

### Account and help

- [ ] Add direct privacy-policy and account-deletion request entries using existing web pages or a native form for `/api/privacy-requests`.
- [ ] Clearly distinguish a submitted deletion request/reference from completed deletion.
- [ ] Link the actual policy content from checkout agreement text.
- [ ] Keep profile read-only until a deliberately authorized customer-update API exists.
- [ ] Define support contact/routing from available real contact data; do not treat the help page as an implemented support-ticket service.

Acceptance: review on app appears on web; signed photo upload survives retry; notification read state synchronizes; logout/account switch does not expose previous-user data; a privacy request returns a reference without falsely claiming deletion.

## Phase 6 — Release validation

- [ ] Run web/app unit and type checks after each affected slice; add only meaningful regression/contract tests.
- [ ] Run isolated Firestore/Redis transaction and queue tests for inventory, idempotency, reconciliation and refunds.
- [ ] Run relevant web Playwright suites to detect backend regressions for existing browser clients.
- [ ] Build actual Android/iOS development clients and test Google sign-in, SecureStore and native Razorpay on supported devices. Unit tests do not validate native linking or payment return behavior.
- [ ] Verify production API/web origins, TLS, Firebase project alignment and OAuth app identifiers/signing configuration without embedding server credentials in the app.
- [ ] Define installed-app link handling for shared hotel/booking URLs, including signed-out return navigation. A custom scheme in app config alone does not verify website link association.
- [ ] Build web and workers from the same compatible release; verify required indexes, feature flags and background mode.
- [ ] In staging, verify signed webhook delivery and missed-callback recovery, worker heartbeats, queue backlog/attention states and refund status.
- [ ] Confirm both web and app see the same booking, saved hotel, notification, review and stay-request changes.
- [ ] Measure slow-network, empty/error/offline, app-resume, large-list and accessibility behavior; record device and environment.

Current audit baseline: web 366 pass/88 skip, app 343 pass, both typechecks pass, web lint 0 errors/69 warnings. No production/device/provider release gate was executed in the audit.

## Optional partner app phase

If hotel staff also need mobile access, scope it explicitly after customer parity. Start with reservation list/detail, arrivals/departures, request preparation and check-in/out, then add collections/allocation/housekeeping as needed. Existing partner APIs can be reused with role, active property membership, revision, idempotency and production feature-flag rules preserved. Admin KYC/financial controls do not need to be copied into the customer app to complete customer booking parity.
