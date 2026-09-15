# Helpkey Complete Hotel Booking Platform Checklist

**Market:** India · **Currency:** INR · **Default timezone:** Asia/Kolkata  
**Core stack:** Firebase Authentication + Cloud Firestore + Next.js API routes + Cloudflare R2 + Razorpay  
**Booking modes:** Overnight and hourly  
**Primary roles:** Customer, Partner, Admin

## How to use this checklist

- `[ ]` = not started, `[~]` = in progress, `[x]` = complete, `[-]` = deliberately deferred.
- **MVP** is needed for a safe and usable first public launch.
- **Post-launch** should be planned after the first end-to-end booking loop works.
- **Optional** is valuable but not required for the platform to operate.
- The database and backend contracts are defined in `HELPKEY_DATABASE_SPEC.md`. Do not implement a checklist item in a way that contradicts that file.

---

## 0. Product foundation and decisions

### Product scope

- [ ] **MVP** Define the launch cities/states and the first property types to accept.
- [ ] **MVP** Define the customer value proposition: verified stays, discounts, hourly stays, or another primary reason to choose Helpkey.
- [ ] **MVP** Define the partner value proposition: bookings, simple property management, lower commission, or new customer reach.
- [ ] **MVP** Decide the exact initial property types: hotel, apartment, villa, resort, hostel, guest house, homestay.
- [ ] **MVP** Decide whether every property is instant-book or whether selected properties/rate plans require partner acceptance.
- [ ] **MVP** Define the operational owner for customer support, partner support, payments, refunds, and property approvals.
- [ ] **MVP** Define launch-hour support coverage and escalation contacts.
- [ ] **MVP** Write customer and partner terms, privacy policy, cancellation/refund policy, and content/moderation policy.
- [ ] **MVP** Decide the Helpkey brand name, logo, domain, support email, and legal business identity.
- [ ] **MVP** Decide the tax treatment with a CA before issuing tax invoices or charging GST.
- [ ] **Post-launch** Define service-level targets for partner acceptance, support response, refunds, and payout completion.
- [ ] **Post-launch** Define the partner commission strategy by property/category/city.
- [ ] **Optional** Define loyalty tiers and referral economics.

### Delivery process

- [ ] **MVP** Maintain a product backlog grouped by customer, partner, admin, operations, and platform work.
- [ ] **MVP** Convert each feature into acceptance criteria before development.
- [ ] **MVP** Maintain a decision log for pricing, inventory, cancellation, KYC, tax, and payment-rule decisions.
- [ ] **MVP** Maintain a known-risks list and owner for every launch blocker.
- [ ] **MVP** Set up separate development, staging, and production environments.
- [ ] **MVP** Use feature flags for high-risk releases such as hourly booking, payments, and partner approval.
- [ ] **Post-launch** Maintain a public or internal changelog.

---

## 1. Project setup, engineering quality, and environments

### Application foundation

- [ ] **MVP** Set up the Next.js application with TypeScript.
- [ ] **MVP** Set up shadcn/ui and Tailwind design tokens.
- [ ] **MVP** Create shared layouts for customer site, partner portal, and admin panel.
- [ ] **MVP** Define a consistent route structure.
- [ ] **MVP** Define shared API response and error formats.
- [ ] **MVP** Define shared TypeScript types and Zod schemas for all database documents and API payloads.
- [ ] **MVP** Add `AGENTS.md` with the instruction to read `docs/HELPKEY_DATABASE_SPEC.md` before database/API changes.
- [ ] **MVP** Add environment-variable validation at startup.
- [ ] **MVP** Store secrets only in environment/secret managers, never in source code.
- [ ] **MVP** Configure linting, formatting, type checking, and pre-commit checks.
- [ ] **MVP** Configure CI to run lint, type check, unit tests, and build checks.
- [ ] **MVP** Add error boundaries and user-friendly error states.
- [ ] **MVP** Add loading, empty, offline, and retry states for every major screen.
- [ ] **MVP** Add a global 404 and 500 error experience.
- [ ] **Post-launch** Add visual regression testing for important booking/payment screens.
- [ ] **Post-launch** Add end-to-end browser tests for all critical journeys.

### Firebase and server setup

- [ ] **MVP** Create separate Firebase projects for development, staging, and production.
- [ ] **MVP** Configure Firebase Authentication providers: email/password, phone OTP, and approved social providers.
- [ ] **MVP** Configure Cloud Firestore in production mode.
- [ ] **MVP** Write and deploy Firestore security rules based on role, ownership, membership, and account status.
- [ ] **MVP** Configure Firestore composite indexes from the database specification.
- [ ] **MVP** Use Firebase Admin SDK in server-side API routes/services.
- [ ] **MVP** Set up the Firebase emulator suite for Auth, Firestore, and rules testing.
- [ ] **MVP** Ensure booking, payment, refund, payout, wallet, and inventory writes are server-only.
- [ ] **MVP** Configure scheduled server jobs for hold cleanup, calendar creation, and daily metrics.
- [ ] **Post-launch** Set up Firebase backups/export policy.
- [ ] **Post-launch** Set up alerting for Firestore errors, quota spikes, and suspicious auth activity.

### Cloudflare R2 storage

- [ ] **MVP** Create separate R2 buckets/prefixes for public property media and private documents.
- [ ] **MVP** Define object-key naming conventions by owner type and media type.
- [ ] **MVP** Implement server-generated signed upload URLs.
- [ ] **MVP** Validate upload mime type, size, dimensions, and ownership before recording metadata.
- [ ] **MVP** Implement server-generated short-lived signed read URLs for private files.
- [ ] **MVP** Store only R2 object keys and metadata in Firestore.
- [ ] **MVP** Process images into optimized display sizes/web formats.
- [ ] **MVP** Add cover image, ordering, captions/alt text, and media moderation status.
- [ ] **Post-launch** Add virus/malware scanning for private uploads.
- [ ] **Post-launch** Add image moderation/quality checks.

---

## 2. Identity, account, and authorization

### Customer authentication

- [ ] **MVP** Email/password sign-up.
- [ ] **MVP** Email/password sign-in.
- [ ] **MVP** Email verification flow.
- [ ] **MVP** Password reset flow.
- [ ] **MVP** Customer phone OTP sign-in/verification flow.
- [ ] **MVP** Phone-number change flow with verification.
- [ ] **MVP** Email change flow with verification.
- [ ] **MVP** Session handling and secure logout.
- [ ] **MVP** Account creation error handling for duplicate email/phone.
- [ ] **MVP** Customer profile completion after first sign-up.
- [ ] **Post-launch** Google sign-in.
- [ ] **Post-launch** Apple sign-in where relevant.
- [ ] **Post-launch** Two-factor authentication for sensitive changes.
- [ ] **Optional** Guest checkout with account linking after booking.

### Partner authentication and onboarding identity

- [ ] **MVP** Partner registration using the same Firebase account system.
- [ ] **MVP** Allow an existing customer account to gain the `partner` role.
- [ ] **MVP** Partner login route and dashboard redirect.
- [ ] **MVP** Partner onboarding status: started, property setup, submitted, active.
- [ ] **MVP** Partner KYC status and payout eligibility status.
- [ ] **MVP** Restrict suspended/disabled partners from protected mutations.
- [ ] **Post-launch** Staff invitations and role assignment.
- [ ] **Post-launch** Partner organization/group model for chains and multi-owner businesses.

### Admin identity and access

- [ ] **MVP** Define a safe admin-provisioning method; do not allow public self-assignment of the admin role.
- [ ] **MVP** Admin login and protected admin route group.
- [ ] **MVP** Server-side admin authorization on every admin action.
- [ ] **MVP** Admin account suspension/activation controls.
- [ ] **MVP** Record actor IDs on privileged changes.
- [ ] **Post-launch** Admin role levels and approval limits.
- [ ] **Post-launch** Admin audit-log explorer.
- [ ] **Post-launch** Admin impersonation with explicit banner, reason, expiry, and audit record.

### Account controls

- [ ] **MVP** Account profile: name, email, phone, photo, language preference.
- [ ] **MVP** Account status handling: active, suspended, disabled, deleted.
- [ ] **MVP** Customer consent settings for email, SMS, WhatsApp, and push.
- [ ] **MVP** Delete/deactivate account request flow.
- [ ] **MVP** Safe response when a suspended account tries to make a booking or payment.
- [ ] **Post-launch** Account data export request.
- [ ] **Post-launch** Full anonymization/retention workflow after legal review.

---

## 3. Customer discovery and search

### Search entry

- [ ] **MVP** Search by destination/city.
- [ ] **MVP** Google Maps place autocomplete and structured address capture.
- [ ] **MVP** Search by check-in/check-out date and time.
- [ ] **MVP** Search by hourly duration/start time.
- [ ] **MVP** Search by adults, children, infants, and rooms.
- [ ] **MVP** Separate/clear UI for overnight and hourly stays.
- [ ] **MVP** Validate that dates and times are future-valid in the property timezone.
- [ ] **MVP** Preserve search input through listing and detail pages.
- [ ] **MVP** Empty-state experience when no properties match.
- [ ] **MVP** Search suggestions for cities/areas.
- [ ] **Post-launch** Search by landmark, locality, airport, station, or point of interest.
- [ ] **Post-launch** Current-location/geofenced nearby search.
- [ ] **Post-launch** Map view with property pins.
- [ ] **Post-launch** Full-text and typo-tolerant search engine.

### Search results

- [ ] **MVP** Show only active, approved, bookable properties.
- [ ] **MVP** Show property name, type, location, primary image, rating, review count, and starting price.
- [ ] **MVP** Show whether the result supports hourly, overnight, or both.
- [ ] **MVP** Show taxes/fees clarity near displayed price.
- [ ] **MVP** Filter by property type.
- [ ] **MVP** Filter by price range.
- [ ] **MVP** Filter by rating.
- [ ] **MVP** Filter by core amenities such as Wi-Fi, parking, breakfast, air conditioning, pool, and restaurant.
- [ ] **MVP** Sort by recommended, price low-to-high, price high-to-low, rating, and distance where supported.
- [ ] **MVP** Paginate or infinite-scroll safely.
- [ ] **MVP** Store recently viewed properties.
- [ ] **MVP** Record privacy-safe search analytics.
- [ ] **Post-launch** Filters for couples/family/business-friendly property policies.
- [ ] **Post-launch** Filters for free cancellation, pay at property, instant confirmation, and availability now.
- [ ] **Post-launch** Personalized ranking using customer segment/preferences.
- [ ] **Post-launch** Compare properties.

### Wishlist and personalization

- [ ] **MVP** Add/remove property from default wishlist.
- [ ] **MVP** View wishlist.
- [ ] **MVP** Segment preference: business traveler, family, couple, solo, other.
- [ ] **MVP** Show segment-aware recommendations without excluding valid options.
- [ ] **Post-launch** Named wishlists.
- [ ] **Post-launch** Price-drop/availability alerts for wishlist properties.
- [ ] **Post-launch** Recently searched and continue-planning sections.

---

## 4. Property detail page and customer-facing content

- [ ] **MVP** SEO-friendly property URL using unique slug.
- [ ] **MVP** Property name, type, address, maps link, and distance/locality context.
- [ ] **MVP** Property image gallery with cover image.
- [ ] **MVP** Room-type image galleries.
- [ ] **MVP** Property description and room descriptions.
- [ ] **MVP** Amenities grouped by category.
- [ ] **MVP** Check-in/check-out rules and property timezone clarity.
- [ ] **MVP** Children, pets, smoking, identity-document, and house rules.
- [ ] **MVP** Cancellation policy summary before room selection.
- [ ] **MVP** Contact/help link with safe privacy controls.
- [ ] **MVP** Review score, category ratings, review count, and published reviews.
- [ ] **MVP** Room availability for the customer’s selected dates/times and guests.
- [ ] **MVP** Rate plan details: duration, meal plan, refundability, payment option, and partner confirmation requirement.
- [ ] **MVP** Complete price breakdown before checkout: base, tax, customer fee, discount, deposit, balance-at-property, total.
- [ ] **MVP** “No rooms available” state and nearby alternatives.
- [ ] **MVP** Report a listing/content issue.
- [ ] **Post-launch** Multilingual property content selection.
- [ ] **Post-launch** Nearby attractions/transport information.
- [ ] **Post-launch** Accessibility features and property accessibility details.
- [ ] **Optional** Virtual tour/video.
- [ ] **Optional** Questions and answers section.

---

## 5. Partner onboarding and property listing

### Join and account creation

- [ ] **MVP** Partner landing page explaining value and eligibility.
- [ ] **MVP** Initial join form: property type, city/location, estimated room count.
- [ ] **MVP** Preserve initial join-form answers after sign-up.
- [ ] **MVP** Partner sign-up/sign-in choice.
- [ ] **MVP** Onboarding progress indicator and draft saving.
- [ ] **MVP** Resume onboarding from the last completed step.

### Property setup wizard

- [ ] **MVP** Property basics: name, type, description, contact details.
- [ ] **MVP** Google Maps address and pin confirmation.
- [ ] **MVP** India address fields: address, city, state, postal code.
- [ ] **MVP** Check-in/check-out times and property timezone.
- [ ] **MVP** Property operational policies: children, pets, smoking, identity requirements.
- [ ] **MVP** Add property amenities.
- [ ] **MVP** Request/add custom property amenity.
- [ ] **MVP** Upload property cover and gallery images.
- [ ] **MVP** Add room types and room images.
- [ ] **MVP** Add overnight, hourly, or both booking modes per room type.
- [ ] **MVP** Add room capacity: adults, children, infants, maximum occupancy, beds.
- [ ] **MVP** Add rates and payment options.
- [ ] **MVP** Select/configure cancellation policy.
- [ ] **MVP** Review all information before submission.
- [ ] **MVP** Submit property for admin approval.
- [ ] **MVP** Show pending-review, requested-changes, rejection, approval, and active states.
- [ ] **MVP** Show rejection/requested-change reason and allow resubmission.
- [ ] **MVP** Allow a partner to pause an approved property.
- [ ] **MVP** Auto-hide inactive/no-inventory property from customer search.
- [ ] **Post-launch** Bulk property import.
- [ ] **Post-launch** Multiple properties in a chain/group dashboard.
- [ ] **Post-launch** Property ownership transfer workflow.

### KYC and payout readiness

- [ ] **MVP** Collect required partner/business identity details before payout eligibility.
- [ ] **MVP** Collect GST details where applicable.
- [ ] **MVP** Collect bank-account proof/details securely.
- [ ] **MVP** Upload individual verification documents to private R2 storage.
- [ ] **MVP** Per-document review status: pending, approved, rejected, resubmission required.
- [ ] **MVP** Admin review and rejection reason for every document.
- [ ] **MVP** Block payout creation until required documents are approved.
- [ ] **MVP** Show partner KYC status and missing action list.
- [ ] **Post-launch** Document expiry/renewal alerts.
- [ ] **Post-launch** Automated KYC verification provider integration.

---

## 6. Rooms, rates, availability, and inventory

### Room types

- [ ] **MVP** Create, edit, pause, archive room types.
- [ ] **MVP** Room name, description, images, bed configuration, bathroom type, size, and amenities.
- [ ] **MVP** Total sellable inventory for each room type.
- [ ] **MVP** Adult/child/infant capacity validation.
- [ ] **MVP** Customer-visible capacity and occupancy messaging.
- [ ] **MVP** Prevent room-type deletion when historic bookings reference it; archive instead.
- [ ] **Post-launch** Physical room/room-number allocation.
- [ ] **Post-launch** Housekeeping status per physical room.
- [ ] **Post-launch** Connecting rooms, accessibility room flags, smoking/non-smoking units.

### Rate plans and pricing

- [ ] **MVP** Create, edit, pause, archive rate plans.
- [ ] **MVP** Support overnight and hourly rate plans.
- [ ] **MVP** Require duration in minutes for hourly plans.
- [ ] **MVP** Base rate in INR paise.
- [ ] **MVP** Meal plan: no meals, breakfast, half board, full board.
- [ ] **MVP** Payment mode: full, deposit, pay at property.
- [ ] **MVP** Deposit calculation rule.
- [ ] **MVP** Customer fee rule and partner commission rule.
- [ ] **MVP** Tax rule abstraction; final tax configuration after CA decision.
- [ ] **MVP** Cancellation-policy selection.
- [ ] **MVP** Minimum advance booking and maximum booking window.
- [ ] **MVP** Minimum/maximum stay/duration rules.
- [ ] **MVP** Optional partner confirmation per rate plan.
- [ ] **MVP** Display all charges at checkout before payment.
- [ ] **MVP** Snapshot the effective rate and all commercial rules into a booking.
- [ ] **Post-launch** Day-of-week and date-range prices.
- [ ] **Post-launch** Seasonal pricing.
- [ ] **Post-launch** Occupancy/demand pricing.
- [ ] **Post-launch** Early-bird, last-minute, long-stay, mobile-only, and member pricing.
- [ ] **Post-launch** Additional guest and extra-bed pricing.
- [ ] **Post-launch** Corporate/negotiated rate plans.

### Availability and inventory control

- [ ] **MVP** Create one room-type/day inventory calendar in property local time.
- [ ] **MVP** Use shared hourly capacity buckets for both hourly and overnight booking.
- [ ] **MVP** Support date-level room inventory capacity.
- [ ] **MVP** Support hourly capacity blocks and maintenance/offline blocks.
- [ ] **MVP** Allow partner to change availability in the dashboard.
- [ ] **MVP** Allow bulk date-range availability changes.
- [ ] **MVP** Allow stop-sell by rate plan/date.
- [ ] **MVP** Create a short inventory hold before payment/approval.
- [ ] **MVP** Re-check all overlapping buckets in a Firestore transaction before confirming.
- [ ] **MVP** Release inventory after hold expiry, payment failure, partner rejection, or eligible cancellation.
- [ ] **MVP** Make hold, confirmation, and release idempotent.
- [ ] **MVP** Prevent negative inventory and double bookings.
- [ ] **MVP** Show partner a calendar/list view of availability and blocks.
- [ ] **MVP** Create inventory calendars ahead of time with a scheduled job.
- [ ] **MVP** Set a maximum bookable stay/duration within Firestore transaction limits.
- [ ] **Post-launch** Minimum-stay, maximum-stay, closed-to-arrival, and closed-to-departure rules.
- [ ] **Post-launch** Channel-manager sync.
- [ ] **Post-launch** External OTA inventory sync.

---

## 7. Customer booking and checkout journey

### Quote and selection

- [ ] **MVP** Validate selected property, room type, rate plan, dates/times, guest count, and availability.
- [ ] **MVP** Calculate a server-side quote.
- [ ] **MVP** Recalculate quote on every meaningful selection change.
- [ ] **MVP** Show nightly/hourly rate, duration, base price, tax, customer fee, discount, deposit, balance-at-property, and total.
- [ ] **MVP** Clearly label instant confirmation vs partner confirmation.
- [ ] **MVP** Clearly label free cancellation/partial refund/non-refundable terms.
- [ ] **MVP** Clearly show check-in/check-out date and local time.
- [ ] **MVP** Warn on invalid/insufficient guest capacity.
- [ ] **MVP** Require consent to house rules and cancellation policy.

### Guest details

- [ ] **MVP** Collect booker details.
- [ ] **MVP** Collect all staying guest details.
- [ ] **MVP** Allow booker and primary guest to be different people.
- [ ] **MVP** Collect adults, children, infants with validation.
- [ ] **MVP** Collect contact email and phone for booking updates.
- [ ] **MVP** Collect nationality and guest identity information only when needed by property rules.
- [ ] **MVP** Support special requests without promising they are guaranteed.
- [ ] **MVP** Save an immutable guest snapshot under the booking.
- [ ] **Post-launch** Saved traveler selection.
- [ ] **Post-launch** Pre-check-in online form/document workflow.

### Booking creation

- [ ] **MVP** Generate a human-readable booking code.
- [ ] **MVP** Create inventory hold before payment/partner decision.
- [ ] **MVP** Create booking with the correct initial state.
- [ ] **MVP** Create status-event records for every state transition.
- [ ] **MVP** Ensure one request cannot create duplicate bookings.
- [ ] **MVP** Handle expiry/deadline for payment and partner acceptance.
- [ ] **MVP** Restore inventory exactly once after failed/expired/rejected flow.
- [ ] **MVP** Show a clear booking-pending page while payment/partner confirmation is unresolved.
- [ ] **MVP** Show confirmation page after confirmed booking.
- [ ] **MVP** Send customer and partner notifications after state changes.
- [ ] **MVP** Ensure confirmed booking appears in both customer and partner views.

### Booking management

- [ ] **MVP** Customer booking list: upcoming, current, past, cancelled.
- [ ] **MVP** Customer booking detail page with booking code, property, room, guest details, payment, policy, and status timeline.
- [ ] **MVP** Partner booking list filtered by property/status/date.
- [ ] **MVP** Partner booking detail view with safe guest contact details and operational actions.
- [ ] **MVP** Customer cancellation flow with refund estimate before confirmation.
- [ ] **MVP** Partner cancellation request/action with reason.
- [ ] **MVP** Admin cancellation and override capability.
- [ ] **MVP** Check-in action by authorized partner/admin.
- [ ] **MVP** Check-out action by authorized partner/admin.
- [ ] **MVP** No-show action with policy calculation.
- [ ] **MVP** Customer guest-detail editing cutoff.
- [ ] **MVP** Customer support link from every booking.
- [ ] **Post-launch** Booking modification and controlled repricing.
- [ ] **Post-launch** Date changes/room upgrades.
- [ ] **Post-launch** Multi-room booking UI.
- [ ] **Post-launch** Group bookings.
- [ ] **Optional** QR booking confirmation/check-in pass.

---

## 8. Payments, deposits, refunds, wallet, and payouts

### Razorpay and payment collection

- [ ] **MVP** Create Razorpay orders server-side.
- [ ] **MVP** Support card, UPI, net banking, and other enabled Razorpay methods.
- [ ] **MVP** Support full-payment booking.
- [ ] **MVP** Support deposit booking.
- [ ] **MVP** Support pay-at-property rate plans.
- [ ] **MVP** Store each payment attempt separately.
- [ ] **MVP** Verify Razorpay webhook signature using raw body.
- [ ] **MVP** Store each provider webhook event idempotently.
- [ ] **MVP** Confirm booking only after verified payment success or valid pay-at-property rule.
- [ ] **MVP** Handle payment pending, success, failure, cancellation, and retry.
- [ ] **MVP** Reconcile payment records against Razorpay provider IDs.
- [ ] **MVP** Never trust the browser payment-success callback by itself.
- [ ] **MVP** Show receipt/payment status to customer.
- [ ] **MVP** Store price/tax/fee/commission snapshots in every booking.
- [ ] **Post-launch** Payment reconciliation dashboard and exception queue.
- [ ] **Post-launch** Alternative payment providers.
- [ ] **Optional** EMI and international card support.

### Refunds and cancellation finance

- [ ] **MVP** Calculate cancellation refund from booking policy snapshot.
- [ ] **MVP** Support full and partial refund amount records.
- [ ] **MVP** Allow partner/admin refund request workflow.
- [ ] **MVP** Require refund reason and actor identity.
- [ ] **MVP** Execute/track Razorpay refunds safely.
- [ ] **MVP** Handle refund pending, processing, success, and failure states.
- [ ] **MVP** Update booking payment status after refund outcome.
- [ ] **MVP** Send refund notifications and show refund timeline to customer.
- [ ] **MVP** Prevent refund amount from exceeding settled eligible payment amount.
- [ ] **Post-launch** Refund to original payment method versus wallet choice.
- [ ] **Post-launch** Dispute/chargeback workflow.

### Wallet, credits, and loyalty

- [ ] **MVP** Create one customer wallet account.
- [ ] **MVP** Track loyalty balance.
- [ ] **MVP** Track promotional credits in paise.
- [ ] **MVP** Track refund credits in paise.
- [ ] **MVP** Use immutable wallet ledger transactions.
- [ ] **MVP** Update balance and ledger transaction atomically.
- [ ] **MVP** Show wallet balance/history to customer.
- [ ] **MVP** Define whether each balance type can be used at checkout.
- [ ] **MVP** Prevent duplicate wallet credits/debits on retry.
- [ ] **Post-launch** Loyalty earning/redemption rules.
- [ ] **Post-launch** Credit expiry rules and expiry notifications.
- [ ] **Post-launch** Referral credits.

### Partner settlement and payouts

- [ ] **MVP** Calculate property gross, platform commission, adjustments, and partner net per booking.
- [ ] **MVP** Create manual payout batches.
- [ ] **MVP** Restrict payouts to KYC-eligible partners.
- [ ] **MVP** Store masked bank-account snapshot in payout record.
- [ ] **MVP** Track payout draft, approval, processing, paid, and failed states.
- [ ] **MVP** Store payout reference and paid date.
- [ ] **MVP** Show partner settlement/payout history.
- [ ] **MVP** Generate partner and customer invoice records.
- [ ] **MVP** Prevent a booking from being paid out twice.
- [ ] **Post-launch** Automated bank transfers.
- [ ] **Post-launch** Payout holds/reserves for cancellation windows.
- [ ] **Post-launch** GST/TDS/TCS calculations after accounting decision.

---

## 9. Coupons, offers, and growth features

- [ ] **MVP** Decide whether coupons are enabled at launch; if enabled, admin-only management.
- [ ] **MVP** Coupon code, fixed/percentage discount, minimum booking, maximum discount, start/end dates.
- [ ] **MVP** Overall usage limit and per-user limit.
- [ ] **MVP** Eligible property and customer-segment restrictions.
- [ ] **MVP** Server-side coupon validation at quote and booking confirmation.
- [ ] **MVP** Transactional coupon reservation/redemption/reversal.
- [ ] **MVP** Show coupon discount separately in checkout.
- [ ] **MVP** Coupon performance view for admin.
- [ ] **Post-launch** Property-funded offers.
- [ ] **Post-launch** First-booking, last-minute, location, and referral offers.
- [ ] **Post-launch** Campaign attribution/UTM tracking.
- [ ] **Optional** Gift cards.

---

## 10. Partner portal

### Partner dashboard

- [ ] **MVP** Overview cards: today’s check-ins, check-outs, upcoming bookings, cancellations, revenue/settlement view.
- [ ] **MVP** Property selector for multi-property partner accounts.
- [ ] **MVP** Alerts for pending partner decisions, missing KYC, missing inventory, rejected media/documents, and requested property changes.
- [ ] **MVP** Upcoming arrival/departure list.
- [ ] **MVP** Quick links to rooms, inventory, rates, bookings, property, payouts, and settings.
- [ ] **MVP** Dashboard data scoped to partner membership.
- [ ] **Post-launch** Occupancy, ADR, RevPAR, cancellation, and conversion trends.

### Property management

- [ ] **MVP** Edit property information with approved-field restrictions.
- [ ] **MVP** Manage property media and cover image.
- [ ] **MVP** Manage amenities.
- [ ] **MVP** Manage room types.
- [ ] **MVP** Manage rate plans.
- [ ] **MVP** Manage policies.
- [ ] **MVP** Pause/unpause property or room/rate plan.
- [ ] **MVP** Submit relevant changes for review.
- [ ] **MVP** Show lifecycle and approval state.
- [ ] **Post-launch** Bulk editing across properties.
- [ ] **Post-launch** Staff management and permissions.

### Reservation operations

- [ ] **MVP** View booking list by date/status/room type.
- [ ] **MVP** View booking details and guest list.
- [ ] **MVP** Accept or reject bookings that require partner confirmation.
- [ ] **MVP** Mark checked-in, checked-out, no-show.
- [ ] **MVP** View special requests.
- [ ] **MVP** Initiate a cancellation/refund request with reason.
- [ ] **MVP** Customer-property messaging on permitted conversations.
- [ ] **MVP** Show payment/deposit/balance-at-property status.
- [ ] **Post-launch** Front desk calendar/grid.
- [ ] **Post-launch** Physical room allocation and housekeeping.
- [ ] **Post-launch** Download arrivals/departures report.

### Partner finance and reviews

- [ ] **MVP** Show per-booking commercial breakdown safely.
- [ ] **MVP** Show available/paid payout history.
- [ ] **MVP** Show KYC/payout eligibility status.
- [ ] **MVP** Show partner invoices/settlement statements.
- [ ] **MVP** View and reply to published reviews.
- [ ] **Post-launch** Revenue export and finance reports.
- [ ] **Post-launch** Dispute center and payout reconciliation.

---

## 11. Admin control center

### Admin dashboard and queues

- [ ] **MVP** Platform overview: bookings, revenue, payments, refunds, active properties, active partners, users.
- [ ] **MVP** Pending property approvals queue.
- [ ] **MVP** Pending document/KYC review queue.
- [ ] **MVP** Pending media moderation queue.
- [ ] **MVP** Pending partner-confirmation/booking exceptions queue.
- [ ] **MVP** Payment/refund/payout exceptions queue.
- [ ] **MVP** Support/dispute queue.
- [ ] **MVP** Review moderation queue.
- [ ] **MVP** Search/filter/export across core admin lists.

### Partner and property administration

- [ ] **MVP** View partner profile and all owned properties.
- [ ] **MVP** Approve, reject, request changes, pause, suspend, archive property.
- [ ] **MVP** Record admin reason for rejection/suspension/change request.
- [ ] **MVP** Approve/reject each KYC document.
- [ ] **MVP** Approve/reject property and room media.
- [ ] **MVP** Set/override partner commission rule.
- [ ] **MVP** Set property/customer fee settings where allowed.
- [ ] **MVP** Activate/deactivate rate plans/properties in emergencies.
- [ ] **MVP** Manage master amenities and policy templates.
- [ ] **Post-launch** Bulk approval/change workflow.
- [ ] **Post-launch** Partner performance and quality scorecard.

### Booking, payment, and customer administration

- [ ] **MVP** Search every booking by booking code, customer, property, partner, date, and status.
- [ ] **MVP** View immutable booking snapshots and status-event history.
- [ ] **MVP** Cancel/override a booking with recorded reason.
- [ ] **MVP** View payment attempts, Razorpay IDs, and webhook processing outcome.
- [ ] **MVP** Initiate/approve refunds.
- [ ] **MVP** Create/approve/mark manual payouts paid.
- [ ] **MVP** View wallet history and apply controlled adjustments.
- [ ] **MVP** Manage coupons if enabled.
- [ ] **MVP** Suspend/activate user accounts.
- [ ] **MVP** Moderate reviews.
- [ ] **MVP** View customer/partner conversations and support tickets when necessary.
- [ ] **Post-launch** Fine-grained admin roles and approval limits.
- [ ] **Post-launch** Full audit-log viewer.

---

## 12. Communication, notifications, and support

### Notification platform

- [ ] **MVP** Create logical in-app notifications.
- [ ] **MVP** Store a delivery record for every Email, SMS, WhatsApp, Push, and in-app attempt.
- [ ] **MVP** Configure notification templates by event, channel, language, and version.
- [ ] **MVP** Respect communication consent and unsubscribe preferences where applicable.
- [ ] **MVP** Mask recipients in internal delivery logs.
- [ ] **MVP** Track sent, delivered, failed, skipped, and retry states.
- [ ] **MVP** Avoid sending duplicate notifications on idempotent/retried events.
- [ ] **MVP** Add notification-center read/unread state.
- [ ] **Post-launch** Notification preferences per event type.
- [ ] **Post-launch** Quiet hours and frequency limits.

### Required transactional events

- [ ] **MVP** Sign-up/email/phone verification.
- [ ] **MVP** Password reset.
- [ ] **MVP** Partner property submitted, changes requested, approved, rejected, suspended.
- [ ] **MVP** KYC document approved/rejected/resubmission required.
- [ ] **MVP** Booking request created.
- [ ] **MVP** Partner accepted/rejected/expired decision.
- [ ] **MVP** Payment succeeded/failed.
- [ ] **MVP** Booking confirmed.
- [ ] **MVP** Check-in reminder.
- [ ] **MVP** Cancellation and refund updates.
- [ ] **MVP** New partner payout/paid payout.
- [ ] **MVP** Review invitation after checkout.
- [ ] **MVP** Support-ticket updates.

### Messaging and support

- [ ] **MVP** Customer-property conversation tied to a booking when appropriate.
- [ ] **MVP** Participant/membership authorization for messages.
- [ ] **MVP** Support-ticket creation for booking, payment, refund, property, account, and safety issues.
- [ ] **MVP** Support priority, status, assignee, history, and resolution fields.
- [ ] **MVP** Support messages and evidence uploads.
- [ ] **MVP** Private admin-note capability in tickets.
- [ ] **MVP** Clear emergency/safety escalation instructions.
- [ ] **Post-launch** Chat SLA monitoring and canned responses.
- [ ] **Post-launch** Help center/knowledge base.
- [ ] **Optional** AI support assistant with human escalation.

---

## 13. Reviews, trust, quality, and safety

- [ ] **MVP** Permit reviews only after verified `checked_out` bookings.
- [ ] **MVP** Enforce one review per booking.
- [ ] **MVP** Support overall and category ratings: cleanliness, location, staff, facilities, value.
- [ ] **MVP** Customer review title, comment, and optional media.
- [ ] **MVP** Admin moderation: pending, published, rejected, hidden.
- [ ] **MVP** Partner reply to property reviews.
- [ ] **MVP** Recalculate property rating average/count after publish/edit/hide/delete.
- [ ] **MVP** Report review/listing flow.
- [ ] **MVP** Enforce media moderation before public display.
- [ ] **MVP** Ensure approved property status before customer listing visibility.
- [ ] **Post-launch** Fraud/spam review detection.
- [ ] **Post-launch** Partner quality score and customer complaint trend.
- [ ] **Post-launch** Safety incident workflow.

---

## 14. Localization, SEO, marketing, and acquisition

### Localization and accessibility

- [ ] **MVP** Store `preferredLanguage` for users.
- [ ] **MVP** Store default and supported languages per property.
- [ ] **MVP** Use translation documents for property text and notification templates.
- [ ] **MVP** Format INR, dates, times, and durations consistently for India.
- [ ] **MVP** Show all operational times in the property timezone.
- [ ] **MVP** Keyboard navigation and visible focus states.
- [ ] **MVP** Accessible labels for forms, dates, time picker, filters, and images.
- [ ] **MVP** Sufficient color contrast and readable error messages.
- [ ] **Post-launch** Full Hindi and other selected-language UI translation.
- [ ] **Post-launch** Screen-reader journey testing.

### SEO and content marketing

- [ ] **MVP** Unique property slugs.
- [ ] **MVP** Server-rendered/indexable public property pages.
- [ ] **MVP** Dynamic SEO title, meta description, Open Graph metadata, and canonical URL per property.
- [ ] **MVP** XML sitemap for active approved properties.
- [ ] **MVP** robots.txt and no-index for private/admin/partner/checkout pages.
- [ ] **MVP** Structured data for accommodation/property where legally/technically valid.
- [ ] **MVP** Optimized media, lazy loading, and core web vitals tracking.
- [ ] **Post-launch** City, locality, property-type, hourly-stay, and travel-intent landing pages.
- [ ] **Post-launch** Local SEO and Google Business/partner acquisition material.
- [ ] **Optional** Blog, travel guides, and destination pages.

### Acquisition and attribution

- [ ] **MVP** Capture source/UTM data for registrations and bookings.
- [ ] **MVP** Track search-to-detail, detail-to-checkout, checkout-to-paid conversion events.
- [ ] **MVP** Track partner onboarding funnel: joined, draft, submitted, approved, active.
- [ ] **MVP** Define event naming and ownership before adding analytics SDKs.
- [ ] **Post-launch** Referral codes.
- [ ] **Post-launch** Partner acquisition CRM.
- [ ] **Post-launch** Retargeting/audience integration after consent/legal review.

---

## 15. Analytics and reporting

### Customer/product analytics

- [ ] **MVP** Track searches, result views, property views, room selections, checkout starts, payment attempts, confirmed bookings, cancellations, and review submissions.
- [ ] **MVP** Track hourly and overnight bookings separately.
- [ ] **MVP** Track conversion by city, property type, booking mode, source, device, and customer segment.
- [ ] **MVP** Track failed payment and failed inventory-hold reasons.
- [ ] **MVP** Track support-ticket categories and resolution times.
- [ ] **MVP** Store daily platform metrics projection.
- [ ] **MVP** Provide admin daily summaries.
- [ ] **Post-launch** Cohort retention and repeat booking analysis.
- [ ] **Post-launch** Customer lifetime value and cancellation prediction.

### Partner analytics

- [ ] **MVP** Track booking count, confirmed count, cancellations, check-ins, check-outs, gross booking value, commission, and net payout.
- [ ] **MVP** Track room nights and room hours.
- [ ] **MVP** Track occupancy rate and average daily rate.
- [ ] **MVP** Store daily property metrics projection.
- [ ] **MVP** Show partner dashboard summary scoped to their properties.
- [ ] **Post-launch** Revenue by room type/rate plan/weekday.
- [ ] **Post-launch** Booking lead-time, channel/source, and review-score trends.
- [ ] **Post-launch** Export CSV/PDF reports.

### Operational analytics

- [ ] **MVP** Daily pending approvals, KYC queue, media queue, booking exceptions, refund queue, and payout queue.
- [ ] **MVP** Monitor inventory-hold expiry/release outcomes.
- [ ] **MVP** Monitor webhook failures and retry backlog.
- [ ] **MVP** Monitor notification delivery failures.
- [ ] **Post-launch** Fraud/risk signals and anomaly dashboards.

---

## 16. Security, privacy, reliability, and compliance

### Security

- [ ] **MVP** Firestore rules deny-by-default and enforce ownership/membership.
- [ ] **MVP** Server-side role/status checks on every privileged route.
- [ ] **MVP** Validate every request with Zod; reject unknown/unexpected fields.
- [ ] **MVP** Rate-limit auth, OTP, search, quote, booking-hold, payment, upload, and support endpoints.
- [ ] **MVP** Use idempotency keys on retryable money/inventory operations.
- [ ] **MVP** Use transaction preconditions for inventory/coupon/wallet writes.
- [ ] **MVP** Use CSRF protections appropriate to the chosen auth/session method.
- [ ] **MVP** Set secure headers, CSP, HTTPS, and cookie settings where applicable.
- [ ] **MVP** Never log passwords, OTPs, raw card/payment data, unmasked documents, or sensitive guest identity data.
- [ ] **MVP** Store private R2 object keys; use short-lived signed URLs.
- [ ] **MVP** Validate Razorpay signatures.
- [ ] **MVP** Maintain dependency updates and vulnerability scanning.
- [ ] **Post-launch** Penetration test before scale.
- [ ] **Post-launch** Web application firewall and bot protection tuning.

### Privacy and legal readiness

- [ ] **MVP** Publish privacy policy, terms of use, partner terms, cancellation policy, and cookie policy where relevant.
- [ ] **MVP** Obtain communication consent and honor opt-out preferences.
- [ ] **MVP** Collect only guest/KYC data necessary for the booking/property requirement.
- [ ] **MVP** Clearly state why identity documents are collected when required.
- [ ] **MVP** Limit private-document access to owner/admin roles.
- [ ] **MVP** Define incident reporting and internal escalation process.
- [ ] **MVP** Confirm GST/invoice/tax obligations with accountant/legal advisor.
- [ ] **Post-launch** Formal data retention, deletion, anonymization, and subject-access policy.
- [ ] **Post-launch** Vendor data-processing agreements as needed.

### Reliability and operations

- [ ] **MVP** Centralized error logging for frontend and API routes.
- [ ] **MVP** Alert on payment webhook failures, booking-confirmation failures, inventory transaction errors, and elevated API error rate.
- [ ] **MVP** Define runbooks for payment failure, overbooking incident, refund issue, R2 outage, Firebase outage, and partner dispute.
- [ ] **MVP** Back up/export critical Firestore data regularly.
- [ ] **MVP** Test restore/recovery procedure.
- [ ] **MVP** Set scheduled jobs with logs, retry policy, and failure alerts.
- [ ] **MVP** Use safe migrations and never break historic booking references.
- [ ] **Post-launch** Load testing for search, inventory holds, checkout, and webhooks.
- [ ] **Post-launch** Disaster-recovery exercise.

---

## 17. Testing checklist

### Unit and integration tests

- [ ] **MVP** Price calculation tests: tax, fees, discount, deposit, pay-at-property, commission.
- [ ] **MVP** Cancellation-policy calculation tests.
- [ ] **MVP** Capacity and guest-count validation tests.
- [ ] **MVP** Hourly time-bucket calculation tests.
- [ ] **MVP** Overnight time-bucket calculation tests across date boundaries.
- [ ] **MVP** Daylight/timezone conversion tests even if launch is India-focused.
- [ ] **MVP** Inventory hold/confirm/release idempotency tests.
- [ ] **MVP** Simultaneous last-room booking race tests.
- [ ] **MVP** Partner acceptance/rejection/expiry tests.
- [ ] **MVP** Payment webhook duplicate/out-of-order event tests.
- [ ] **MVP** Coupon-limit and wallet-duplication race tests.
- [ ] **MVP** Booking snapshot immutability tests.
- [ ] **MVP** Firestore rules tests by customer, partner, admin, suspended user, and unauthenticated user.
- [ ] **MVP** API authorization tests for property membership and ownership.

### End-to-end test journeys

- [ ] **MVP** Customer email sign-up, verification, search, book overnight, pay, confirmation.
- [ ] **MVP** Customer phone OTP sign-in, book hourly, pay, confirmation.
- [ ] **MVP** Partner sign-up, property draft, room/rates, media, submit, admin approval, live listing.
- [ ] **MVP** Approval-required booking: hold, partner accepts, customer pays, booking confirms.
- [ ] **MVP** Partner rejection and inventory release.
- [ ] **MVP** Failed payment and inventory release.
- [ ] **MVP** Customer cancellation/refund journey.
- [ ] **MVP** Partner check-in/check-out and customer review journey.
- [ ] **MVP** KYC approval then manual payout journey.
- [ ] **MVP** Suspended customer/partner blocked from protected actions.
- [ ] **MVP** Private R2 file cannot be accessed without authorized signed URL.
- [ ] **Post-launch** Mobile browser testing across current Android/iOS devices.
- [ ] **Post-launch** Accessibility testing with keyboard and screen reader.

---

## 18. Launch readiness

### Pre-launch content and operations

- [ ] **MVP** Onboard and verify initial partner properties.
- [ ] **MVP** Ensure each live property has quality cover image, room images, complete address, policies, amenities, inventory, and valid rate plan.
- [ ] **MVP** Ensure each live property has approved KYC before becoming payout eligible.
- [ ] **MVP** Test a real Razorpay transaction in production-safe mode and refund it.
- [ ] **MVP** Test Email, SMS, WhatsApp, Push, and in-app notification paths that are enabled.
- [ ] **MVP** Test property approval/rejection and document review workflows with realistic accounts.
- [ ] **MVP** Prepare internal support macros/runbooks.
- [ ] **MVP** Prepare partner onboarding guide and customer booking help content.
- [ ] **MVP** Set support email/phone/WhatsApp escalation details.
- [ ] **MVP** Configure production domain, SSL, analytics, SEO metadata, sitemap, and monitoring.
- [ ] **MVP** Complete privacy/legal/tax review appropriate to the launch scope.

### Launch gate

- [ ] **MVP** No known route allows direct client write to inventory, bookings, payments, refunds, payouts, coupon redemptions, or wallet balances.
- [ ] **MVP** No known path allows a user to view another user’s private booking/document/payment data.
- [ ] **MVP** All critical end-to-end test journeys pass in staging.
- [ ] **MVP** Overbooking/race tests pass.
- [ ] **MVP** Webhook retries cannot create duplicate payment/booking/refund effects.
- [ ] **MVP** A cancelled/failed/expired booking restores the correct inventory exactly once.
- [ ] **MVP** Every live property is searchable only when active, approved, and sellable.
- [ ] **MVP** Customer sees final payable price before payment.
- [ ] **MVP** Partner sees booking and finance information only for accessible properties.
- [ ] **MVP** Admin can resolve approvals, booking issues, refunds, payouts, and support tickets.
- [ ] **MVP** Monitoring and on-call owner are active for launch.
- [ ] **MVP** Rollback/feature-disable plan exists for payments, hourly bookings, search, and partner approval.

---

## 19. Post-launch expansion roadmap

- [ ] **Post-launch** Physical room allocation, housekeeping, and front-desk operations.
- [ ] **Post-launch** Staff invitations, roles, permissions, and multi-property teams.
- [ ] **Post-launch** Advanced inventory restrictions and calendar management.
- [ ] **Post-launch** Channel manager/OTA integration.
- [ ] **Post-launch** Dedicated full-text multilingual search engine.
- [ ] **Post-launch** Dynamic/seasonal pricing engine.
- [ ] **Post-launch** Multi-room and group booking.
- [ ] **Post-launch** Booking modification, upgrades, and repricing.
- [ ] **Post-launch** Automated payouts and tax withholding workflow.
- [ ] **Post-launch** Corporate accounts, negotiated rates, and invoicing.
- [ ] **Post-launch** Loyalty, referrals, memberships, gift cards, and campaign automation.
- [ ] **Post-launch** Mobile apps/customer and partner apps.
- [ ] **Post-launch** Travel packages, add-ons, airport transfer, activities, and insurance only after core stays work reliably.
- [ ] **Post-launch** Multi-currency/international properties after India operations, tax, and support are stable.

---

## 20. MVP definition of done

Helpkey is ready for its first controlled launch only when a real customer can:

1. Register/sign in, search India properties, choose an overnight or hourly room, see the final INR price, enter all guest details, pay with Razorpay or select an allowed pay-at-property option, and receive a confirmed booking.
2. Cancel according to the displayed policy and see the correct refund status.
3. View booking history, status, payment details, and support help.

And a real partner can:

1. Register, create a property, upload documents/media, create room types and rate plans, set inventory, submit for review, and become live after admin approval.
2. View and act on bookings, including partner acceptance where enabled, check-in, check-out, no-show, and cancellation request.
3. View KYC status, settlement information, payout history, and reviews for their property.

And an admin can:

1. Approve/reject property, media, and KYC documents.
2. Manage all bookings, payments, refunds, payouts, users, properties, and reviews.
3. Resolve support tickets and monitor daily operational metrics.

The platform must also prevent double booking across hourly and overnight stays, safely process duplicate webhooks/retries, protect private data, and leave an operational record for every booking and money movement.
