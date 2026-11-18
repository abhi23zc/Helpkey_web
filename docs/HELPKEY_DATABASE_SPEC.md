# Helpkey Database and Backend Contract

**Status:** MVP source of truth with future-ready fields  
**Stack:** Firebase Authentication, Cloud Firestore, Next.js API routes, Cloudflare R2, Razorpay  
**Market:** India  
**Currency:** INR  
**Default timezone:** `Asia/Kolkata`  
**Supported booking modes:** overnight and hourly

## Instructions for Codex

Read this file completely before changing any Firestore model, security rule, booking flow, payment flow, inventory logic, or related API route.

This file is the implementation source of truth. The accompanying DOCX is explanatory material. If existing code conflicts with this specification, report the conflict before making a destructive migration. Do not silently introduce a new collection, rename a field, add a status, or change a financial/inventory invariant.

Codex must follow these rules:

1. Firebase Authentication owns credentials; `users/{uid}` owns application identity and authorization.
2. Use `roles: Role[]`, not a single `role`, because one user may be both a customer and a partner.
3. Never trust prices, discounts, fees, taxes, commissions, inventory, roles, ownership, or booking/payment statuses received from a client.
4. Privileged mutations go through Next.js server routes/services using Firebase Admin SDK.
5. Inventory holds, booking confirmation, coupon redemption, wallet posting, webhook processing, and inventory release must be transactional and idempotent.
6. Store money as integer paise. Never store financial amounts as floating-point rupees.
7. Store instants as UTC Firestore `Timestamp`. Store a property IANA timezone and local dates for operational queries.
8. Store scalar string IDs rather than Firestore `DocumentReference` values.
9. Store file bytes in Cloudflare R2. Firestore stores object keys and metadata only.
10. Never expose permanent public URLs for KYC, bank documents, guest identity documents, or support evidence. Return short-lived signed URLs from the server.
11. Never hard-delete financial, booking, invoice, payout, wallet-ledger, or webhook records.
12. Historical bookings contain immutable property, room, price, policy, fee, tax, and commission snapshots.
13. Hourly and overnight bookings consume the same room-type capacity calendar.
14. React/client components must not directly write booking, payment, refund, payout, wallet, coupon-redemption, or inventory documents.

## 1. Architecture decisions

| Area | Contract |
|---|---|
| Authentication | Email/password for accounts; customer phone OTP is supported. |
| Roles | `customer`, `partner`, `admin`; the same UID may have multiple roles. |
| Suspended access | A suspended user may authenticate and read permitted account data, but cannot perform protected mutations. |
| Partner ownership | One partner may own multiple properties. |
| Property staff | MVP exposes owner access; `propertyMemberships` supports staff roles later. |
| Property approval | Admin reviews partner documents, properties, and moderated media. |
| Property types | Use `properties` and `propertyType`; do not use a `hotels` collection. |
| Sellable inventory | Sell interchangeable room types, not mandatory physical room numbers. |
| Booking | Instant booking by default; selected property/rate plans may require partner confirmation. |
| Payments | Razorpay full payment or deposit; pay-at-property is supported. |
| Payouts | Manual partner payouts for MVP; KYC required before payout eligibility. |
| Commission | Percentage per booking, stored in basis points and snapshotted. |
| Customer fees | Customer and partner charges may both exist and may be dynamic. |
| Reviews | Verified completed bookings only; one review per booking; admin moderation. |
| Languages | Translatable property and notification content. |
| Search | Firestore structured search for MVP; dedicated search engine may be added later. |

## 2. Common types and conventions

Use TypeScript domain types and runtime validation. Zod is recommended at API boundaries.

```ts
type Timestamp = FirebaseFirestore.Timestamp;
type Currency = "INR";
type CountryCode = "IN";
type BookingMode = "overnight" | "hourly";
type Role = "customer" | "partner" | "admin";
type ActorType = Role | "system";
type AccountStatus = "active" | "suspended" | "disabled" | "deleted";

interface CommonMutableFields {
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string; // UID or "system"
  updatedBy: string; // UID or "system"
  deletedAt: Timestamp | null;
}

interface MoneyRule {
  type: "fixed" | "percentage";
  amountPaise?: number;
  basisPoints?: number; // 100 bps = 1%
  minimumPaise?: number;
  maximumPaise?: number;
}

interface Address {
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  district: string | null;
  state: string;
  postalCode: string;
  countryCode: CountryCode;
}
```

### ID rules

- Random Firestore IDs: most business documents.
- UID as document ID: `users`, `customerProfiles`, `partnerProfiles`, `walletAccounts`.
- Provider event ID: `paymentWebhookEvents/{providerEventId}`.
- Deterministic inventory ID: `{roomTypeId}_{YYYYMMDD}`.
- Deterministic daily property metric ID: `{propertyId}_{YYYYMMDD}`.
- Deterministic daily platform metric ID: `{YYYYMMDD}`.
- `bookingCode`, `ticketCode`, and `invoiceNumber` are human-readable identifiers, not document IDs.

### Required validation

- Email is normalized to lowercase.
- Phone numbers use E.164.
- Coupon codes use normalized uppercase.
- Enum values use lower snake case.
- All counts and paise amounts are safe non-negative integers unless explicitly representing a signed adjustment.
- `endAt` must be later than `startAt`.
- Property timezone must be a valid IANA timezone.
- Server timestamps and actor fields are generated by the backend.

## 3. Collection catalog

```text
users
otpChallenges
customerProfiles
partnerProfiles
propertyMemberships
properties
propertyTranslations
verificationDocuments
mediaAssets
amenities
roomTypes
ratePlans
cancellationPolicies
inventoryCalendars
inventoryHolds
bookings
bookingGuests
bookingStatusEvents
payments
paymentWebhookEvents
refunds
payouts
invoices
walletAccounts
walletTransactions
coupons
couponRedemptions
wishlists
recentlyViewed
reviews
notifications
notificationDeliveries
notificationTemplates
propertyReviewEvents
conversations
messages
supportTickets
supportMessages
dailyPropertyMetrics
dailyPlatformMetrics
```

Use top-level collections for operational queries. Relations are expressed with scalar IDs and verified server-side.

## 4. Identity and access models

### `users/{uid}`

```ts
interface UserDocument extends CommonMutableFields {
  uid: string;
  fullName: string;
  email: string | null;
  phoneNumber: string | null;
  photoURL: string | null;
  roles: Role[];
  accountStatus: AccountStatus;
  emailVerified: boolean;
  phoneVerified: boolean;
  preferredLanguage: string; // e.g. "en", "hi"
  isActive: boolean; // temporary compatibility field; accountStatus is authoritative
  lastLoginAt: Timestamp | null;
}
```

Migration from the current user model:

- Preserve `users/{uid}` and all current UIDs.
- Convert `role` to `roles: [role]`.
- Add `accountStatus`, verification flags, and `preferredLanguage`.
- Move `segmentPreference` to `customerProfiles/{uid}`.
- Do not create a second Firebase Auth user when a customer becomes a partner.

### `otpChallenges/{challengeId}`

```ts
interface OtpChallengeDocument {
  userId: string | null;
  phoneNumber: string;
  purpose: "sign_in" | "verify_phone" | "change_phone";
  otpHash: string; // never store plaintext OTP
  status: "pending" | "verified" | "expired" | "blocked";
  attemptCount: number;
  maxAttempts: number;
  expiresAt: Timestamp;
  verifiedAt: Timestamp | null;
  createdAt: Timestamp;
  createdBy: "system";
}
```

Prefer Firebase Phone Authentication where practical. If custom OTP challenges are used, rate-limit by normalized phone, IP, and device fingerprint.

### `customerProfiles/{uid}`

```ts
interface CustomerProfileDocument extends CommonMutableFields {
  userId: string;
  segmentPreference: "business_traveler" | "family" | "couple" | "solo" | "other";
  travelPreferences: {
    propertyTypes?: string[];
    amenityIds?: string[];
    preferredCities?: string[];
  };
  savedTravellers: Array<{
    id: string;
    fullName: string;
    dateOfBirth: string | null; // YYYY-MM-DD
    ageGroup: "adult" | "child" | "infant";
    nationality: string | null;
  }>;
  defaultCurrency: Currency;
  marketingConsent: Record<"email" | "sms" | "whatsapp" | "push", {
    granted: boolean;
    updatedAt: Timestamp;
  }>;
}
```

Do not store identity-document bytes or unmasked sensitive numbers in `savedTravellers`.

### `partnerProfiles/{uid}`

```ts
type PartnerOnboardingStatus = "started" | "property_setup" | "submitted" | "active";
type KycStatus = "not_started" | "pending" | "approved" | "rejected";

interface PartnerProfileDocument extends CommonMutableFields {
  userId: string;
  businessName: string;
  businessEmail: string;
  businessPhone: string;
  businessAddress: Address;
  gstin: string | null;
  pan: string | null;
  onboardingStatus: PartnerOnboardingStatus;
  kycStatus: KycStatus;
  payoutEligibility: "blocked" | "eligible";
  defaultCommissionBps: number | null;
}
```

`payoutEligibility` becomes `eligible` only after the required KYC and bank documents are individually approved.

### `propertyMemberships/{membershipId}`

```ts
interface PropertyMembershipDocument extends CommonMutableFields {
  propertyId: string;
  userId: string;
  role: "owner" | "manager" | "receptionist" | "revenue_manager";
  permissions: string[];
  status: "active" | "revoked";
}
```

MVP creates an `owner` membership when a property is created. API authorization checks membership, even though staff-management UI is deferred.

## 5. Property, localization, documents, and media

### `properties/{propertyId}`

```ts
type PropertyStatus = "draft" | "pending_review" | "active" | "paused" | "suspended" | "archived";
type ApprovalStatus = "not_submitted" | "pending" | "changes_requested" | "approved" | "rejected" | "revoked";

interface PropertyDocument extends CommonMutableFields {
  ownerId: string;
  partnerId: string;
  name: string;
  slug: string;
  propertyType: "hotel" | "apartment" | "villa" | "resort" | "hostel" | "guest_house" | "homestay" | "other";
  description: string;
  address: Address;
  geoPoint: FirebaseFirestore.GeoPoint;
  geohash: string;
  googlePlaceId: string | null;
  timezone: string;
  checkInTime: string; // local HH:mm
  checkOutTime: string; // local HH:mm
  bookingModes: BookingMode[];
  publicPhone: string;
  publicEmail: string;
  supportContact: string | null;
  roomTypeCount: number;
  totalPhysicalRooms: number;
  currency: Currency;
  customerFeeRule: MoneyRule | null;
  partnerCommissionRule: MoneyRule;
  payAtPropertyEnabled: boolean;
  depositsEnabled: boolean;
  defaultLanguage: string;
  supportedLanguages: string[];
  amenityIds: string[];
  mediaIds: string[];
  coverMediaId: string | null;
  cancellationPolicyIds: string[];
  childrenPolicy: Record<string, unknown>;
  petPolicy: Record<string, unknown>;
  smokingPolicy: Record<string, unknown>;
  identityRequirements: Record<string, unknown>;
  status: PropertyStatus;
  approvalStatus: ApprovalStatus;
  rejectionReason: string | null;
  submittedAt: Timestamp | null;
  approvedAt: Timestamp | null;
  pausedAt: Timestamp | null;
  suspendedUntil: Timestamp | null;
  ratingAverage: number;
  ratingCount: number;
  minimumDisplayPricePaise: number | null;
  isBookable: boolean;
}
```

Property lifecycle:

```text
draft/not_submitted
  -> pending_review/pending
  -> active/approved

pending_review/pending
  -> draft/changes_requested
  -> draft/rejected

active/approved
  -> paused/approved
  -> suspended/approved-or-revoked
  -> archived/approved
```

Approved identity, ownership, Google Maps location, address, legal details, or core property-type changes require admin review. `isBookable` is server-maintained and should become false when the property is inactive or no sellable inventory exists.

### `propertyTranslations/{propertyId_locale}`

```ts
interface PropertyTranslationDocument extends CommonMutableFields {
  propertyId: string;
  locale: string;
  name: string;
  shortDescription: string;
  description: string;
  policyDisplayText: Record<string, string>;
  seoTitle: string;
  seoDescription: string;
  translationStatus: "draft" | "machine" | "reviewed" | "published";
}
```

### `verificationDocuments/{documentId}`

```ts
type VerificationDocumentStatus = "pending" | "approved" | "rejected" | "resubmission_required";

interface VerificationDocumentDocument extends CommonMutableFields {
  ownerType: "partner" | "property";
  ownerId: string;
  documentType: "pan" | "gst" | "identity" | "bank_proof" | "property_registration" | "address_proof" | "other";
  r2ObjectKey: string;
  maskedNumber: string | null;
  checksum: string;
  status: VerificationDocumentStatus;
  reviewReason: string | null;
  reviewedBy: string | null;
  reviewedAt: Timestamp | null;
}
```

Review each document independently. Document expiry is deferred, so do not add expiry enforcement until product requirements are confirmed.

### `mediaAssets/{mediaId}`

```ts
interface MediaAssetDocument extends CommonMutableFields {
  ownerType: "property" | "room_type" | "user" | "review" | "ticket" | "guest_identity";
  ownerId: string;
  r2ObjectKey: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  kind: "cover" | "gallery" | "room" | "evidence" | "identity" | "profile";
  sortOrder: number;
  altText: string | null;
  moderationStatus: "pending" | "approved" | "rejected";
  isPublic: boolean;
}
```

KYC, identity, bank, and support evidence always use `isPublic: false`.

Property onboarding photos use `kind: "property_image"`, `propertyId`, and
`category: "exterior" | "room" | "bathroom" | "reception" | "facilities" | "accessibility" | "additional"`.
Bedroom (`room`) and bathroom photos require a `roomTypeId` belonging to the same
property; other categories store `roomTypeId: null`. Room gallery references are
updated atomically when a photo is assigned or reassigned. The property cover is
selected independently through `properties.coverMediaId`.

Submission requires at least six pending or approved property photos, an exterior
photo, and a bedroom and bathroom photo for every active room type, plus a valid
cover. The minimum therefore becomes `max(6, 1 + 2 * activeRoomTypes)`.
Rejected images and verification documents do not count. Admin approval applies
the same checklist using approved photos only. Existing room gallery links remain
compatible until an explicit photo assignment is saved.


### `amenities/{amenityId}`

```ts
interface AmenityDocument extends CommonMutableFields {
  code: string;
  category: string;
  namesByLocale: Record<string, string>;
  iconKey: string | null;
  allowedScopes: Array<"property" | "room_type">;
  isCustom: boolean;
  propertyId: string | null;
  status: "active" | "archived";
  sortOrder: number;
}
```

Admin manages global amenities. Partner-created custom amenities are scoped to one property and may require moderation.

## 6. Rooms, rate plans, and cancellation policies

### `roomTypes/{roomTypeId}`

```ts
interface RoomTypeDocument extends CommonMutableFields {
  propertyId: string;
  name: string;
  description: string;
  bookingModes: BookingMode[];
  totalInventory: number;
  maxAdults: number;
  maxChildren: number;
  maxInfants: number;
  maxOccupancy: number;
  bedConfigurations: Array<{
    bedType: string;
    count: number;
  }>;
  roomSizeSqFt: number | null;
  bathroomType: "private" | "shared" | null;
  amenityIds: string[];
  mediaIds: string[];
  coverMediaId: string | null;
  status: "draft" | "active" | "paused" | "archived";
}
```

Room types represent interchangeable capacity. Do not require room numbers for MVP. A future `physicalUnits` collection may allocate room numbers such as 101 and 102 without changing sellable inventory.

### `ratePlans/{ratePlanId}`

```ts
interface RatePlanDocument extends CommonMutableFields {
  propertyId: string;
  roomTypeId: string;
  name: string;
  code: string;
  bookingMode: BookingMode;
  pricingModel: "nightly" | "duration";
  durationPrices?: { hours: number; pricePaise: number }[]; // hourly: unique durations, 1–24 whole hours; exact total for each
  basePricePaise: number;
  currency: Currency;
  mealPlan: "none" | "breakfast" | "half_board" | "full_board";
  paymentMode: "full" | "deposit" | "pay_at_property";
  depositRule: MoneyRule | null;
  taxRule: MoneyRule | null;
  customerFeeRule: MoneyRule | null;
  commissionRule: MoneyRule;
  cancellationPolicyId: string;
  requiresPartnerConfirmation: boolean;
  advanceBooking: {
    minimumMinutesBeforeStart: number;
    maximumDaysBeforeStart: number;
  };
  stayRules: {
    minimumDurationMinutes: number | null;
    maximumDurationMinutes: number | null;
    minimumNights: number | null;
    maximumNights: number | null;
  };
  status: "draft" | "active" | "paused" | "archived";
}
```

### `cancellationPolicies/{policyId}`

```ts
interface CancellationPolicyDocument extends CommonMutableFields {
  name: string;
  scope: "admin_template" | "property";
  propertyId: string | null;
  rules: Array<{
    minimumHoursBeforeStart: number;
    refundPercentage: number;
    fixedFeePaise: number;
  }>;
  noShowRule: {
    refundPercentage: number;
    fixedFeePaise: number;
  };
  displayTextByLocale: Record<string, string>;
  status: "active" | "archived";
}
```

Copy the effective cancellation policy into the booking snapshot. Editing a policy never changes an existing booking.

## 7. Unified hourly and overnight inventory

### Core invariant

`inventoryCalendars` uses property-local dates and stable UTC quarter-hour interval IDs. A local day can contain 92, 96, or 100 intervals across DST; never index by local clock hour.

### `inventoryCalendars/{propertyId_roomTypeId_YYYY-MM-DD}`

```ts
interface InventoryCalendarDocument {
  propertyId: string;
  roomTypeId: string;
  date: string;
  reserved: Record<string, number>; // floor(UTC milliseconds / 900000) -> quantity
  blocked: Record<string, number>;
  stopSell?: boolean;
  updatedAt: Timestamp;
}
```

Capacity comes from the room type read inside each reservation/block/capacity transaction. Availability is capacity minus reserved minus blocked. Missing calendars are empty; search never creates calendars.

### `inventoryHolds/{bookingId}`

```ts
interface InventoryHoldDocument {
  bookingId: string;
  propertyId: string;
  roomTypeId: string;
  allocations: { date: string; intervals: string[] }[];
  quantity: 1;
  status: "held" | "committed" | "released";
  expiresAt: Timestamp | null;
}
```

Both modes reserve `[startAt, endAt + cleaningBufferMinutes)`. A 13:00 departure with 30 minutes cleaning permits the next arrival at 13:30. Release the persisted allocation exactly once; do not recompute it from current property settings. Online holds expire at the earlier of arrival and ten minutes after creation. Confirmation commits an unexpired hold without consuming capacity again.

Booking identity is derived from the user and idempotency key and created in the allocation transaction with the parsed request fingerprint. Reuse with different input is a conflict. Ambiguous order creation is reconciled by receipt; it never creates a second booking or replacement order.

Runtime booking fields include `bookingMode: overnight | hourly`, `pricingModel: nightly | duration`, UTC ISO strings `startAt`, `endAt`, `inventoryEndAt`, property `timezone`, local dates/times, duration, billed hours, price/policy snapshots and integer paise totals. Hourly pricing looks up the exact total in `durationPrices` for the requested whole-hour duration. For example, 1 hour at 20000 paise and 2 hours at 30000 paise are independent totals; unpriced and fractional-hour durations are rejected. Each rate has 1–24 unique rows, with positive safe-integer paise prices. `basePricePaise` is derived as the minimum row total for catalog summaries, never used as an hourly booking fallback. Legacy `package` and `per_hour` rates are excluded from new offers and archived, while historical booking snapshots and existing payment holds retain their agreed terms. Overnight prices count local calendar nights. Default cleaning is 30 minutes. Arrivals use 15-minute steps. Maximum stays are 24 hourly hours or 30 nights; arrival horizon is at most 365 days.

Canonical checkout status is `checked_out`; serialize historical `completed` records with that status and accept them for reviews. Lifecycle events live in `bookings/{id}/events`. Early checkout retains the original allocation until the scheduled end; it does not resell or refund automatically.

`paymentAttempts/{paymentId}` records verified captures. `refunds/{id}` records immutable entitlement amount, provider refund ID, status, lease, attempts, errors and timestamps. Processing uses Razorpay's `X-Refund-Idempotency` header with a stable key. Booking cancellation and provider refund completion are separate. Captures after expiry/cancellation enter the refund queue and never revive the booking.

A property selects one writer using `inventoryEngine: interval_v1`. Until cutover, only overnight bookings use legacy `roomNightInventory`; hourly booking fails closed. Close new booking (`isBookable: false`), run `npm run bookings:cutover -- --property ID` for a dry run, supply a booking-ID to room-type-ID JSON mapping for legacy manual bookings when needed, then use `--apply`. Conversion is atomic, preserves historical documents and refuses unresolved rooms, excess capacity, existing interval data or more than 450 writes. Reopen the property only after reconciliation and release checks. Never toggle the engine field manually.

The authenticated maintenance endpoint drains bounded expiry, payment reconciliation and refund batches. Run the booking worker continuously and monitor reported failures/backlogs. Firestore TTL must never delete an unreleased allocation.

## 8. Booking aggregate and guests

### Status types

```ts
type BookingStatus =
  | "pending_partner"
  | "partner_rejected"
  | "pending_payment"
  | "payment_failed"
  | "confirmed"
  | "checked_in"
  | "checked_out"
  | "cancelled"
  | "no_show"
  | "expired";

type PaymentStatus =
  | "not_required"
  | "pending"
  | "partially_paid"
  | "paid"
  | "failed"
  | "refund_pending"
  | "pay_at_property"
  | "paid_at_property"
  | "partially_refunded"
  | "refunded";

type PartnerDecisionStatus = "not_required" | "pending" | "accepted" | "rejected" | "expired";
```

### `bookings/{bookingId}`

```ts
interface BookingDocument extends CommonMutableFields {
  bookingCode: string;
  customerId: string;
  partnerId: string;
  propertyId: string;
  roomTypeId: string;
  ratePlanId: string;
  bookingMode: BookingMode;
  quantity: number; // MVP UI uses 1
  startAt: string; // UTC ISO instant
  endAt: string; // UTC ISO instant
  inventoryEndAt: string; // endAt + snapshotted cleaning buffer
  pricingModel: "nightly" | "duration" | "package" | "per_hour"; // last two: historical snapshots only
  billedHours: number;
  cleaningBufferMinutes: number;
  timezone: string;
  localCheckInDate: string;
  localCheckOutDate: string;
  durationMinutes: number;
  adultCount: number;
  childCount: number;
  infantCount: number;
  primaryGuestId: string | null;
  guestCount: number;
  bookingStatus: BookingStatus;
  paymentStatus: PaymentStatus;
  partnerDecisionStatus: PartnerDecisionStatus;
  requiresPartnerConfirmation: boolean;
  decisionDeadlineAt: Timestamp | null;
  acceptedBy: string | null;
  acceptedAt: Timestamp | null;
  rejectionReason: string | null;
  currency: Currency;
  subtotalPaise: number;
  taxPaise: number;
  customerFeePaise: number;
  discountPaise: number;
  totalPaise: number;
  depositDuePaise: number;
  balanceAtPropertyPaise: number;
  partnerGrossPaise: number;
  commissionPaise: number;
  partnerNetPaise: number;
  propertySnapshot: Record<string, unknown>;
  roomSnapshot: Record<string, unknown>;
  rateSnapshot: Record<string, unknown>;
  taxSnapshot: Record<string, unknown>;
  feeSnapshot: Record<string, unknown>;
  commissionSnapshot: Record<string, unknown>;
  cancellationSnapshot: Record<string, unknown>;
  couponId: string | null;
  couponCode: string | null;
  couponDiscountPaise: number;
  specialRequests: string | null;
  source: "web" | "partner" | "admin";
  inventoryHoldId: string;
  cancellation: {
    cancelledBy: string;
    cancelledByRole: ActorType;
    cancelledAt: Timestamp;
    reason: string;
    refundDuePaise: number;
  } | null;
  checkedInAt: Timestamp | null;
  checkedOutAt: Timestamp | null;
  noShowAt: Timestamp | null;
}
```

Required booking transitions:

```text
pending_partner -> pending_payment | partner_rejected | expired
pending_payment -> confirmed | payment_failed | expired
payment_failed  -> pending_payment | expired
confirmed       -> checked_in | cancelled | no_show
checked_in      -> checked_out
```

Terminal statuses: `partner_rejected`, `checked_out`, `cancelled`, `no_show`, `expired`. Refund processing has its own state and may continue after booking cancellation.

Instant-booking flow starts at `pending_payment`. Approval-required flow starts at `pending_partner`; partner acceptance moves it to `pending_payment`. If pay-at-property is allowed, payment status may be `not_required` or `partially_paid` at confirmation depending on the rate plan.

### `bookingGuests/{guestId}`

```ts
interface BookingGuestDocument extends CommonMutableFields {
  bookingId: string;
  userId: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  ageGroup: "adult" | "child" | "infant";
  nationality: string | null;
  isPrimary: boolean;
  isBooker: boolean;
  identityDocument: {
    documentType: string;
    maskedNumber: string;
    mediaId: string;
  } | null;
}
```

Store every staying guest. The booker may differ from the primary/staying guest.

### `bookingStatusEvents/{eventId}`

```ts
interface BookingStatusEventDocument {
  bookingId: string;
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  actorType: ActorType;
  actorId: string;
  reason: string | null;
  customerVisibleNote: string | null;
  createdAt: Timestamp;
  createdBy: string;
}
```

Status events are immutable.

## 9. Payments, webhooks, refunds, payouts, and invoices

### `payments/{paymentId}`

```ts
interface PaymentDocument extends CommonMutableFields {
  bookingId: string;
  customerId: string;
  propertyId: string;
  provider: "razorpay" | "pay_at_property";
  providerOrderId: string | null;
  providerPaymentId: string | null;
  attemptNumber: number;
  idempotencyKey: string;
  amountPaise: number;
  currency: Currency;
  purpose: "deposit" | "full_payment" | "balance" | "adjustment";
  status: "created" | "pending" | "authorized" | "paid" | "failed" | "cancelled";
  method: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  paidAt: Timestamp | null;
}
```

### `paymentWebhookEvents/{providerEventId}`

```ts
interface PaymentWebhookEventDocument {
  provider: "razorpay";
  eventId: string;
  eventType: string;
  signatureValid: boolean;
  payload: Record<string, unknown>; // sanitized
  processingStatus: "received" | "processed" | "ignored" | "failed";
  processedAt: Timestamp | null;
  error: string | null;
  createdAt: Timestamp;
  createdBy: "system";
}
```

Verify the Razorpay signature before changing payment/booking state. Create the event document using the provider event ID before processing, making duplicate webhooks harmless.

### `refunds/{refundId}`

```ts
interface RefundDocument extends CommonMutableFields {
  bookingId: string;
  paymentId: string;
  providerRefundId: string | null;
  amountPaise: number;
  reason: string;
  requestedByRole: "partner" | "admin";
  requestedBy: string;
  status: "requested" | "processing" | "succeeded" | "failed" | "cancelled";
  policyCalculation: Record<string, unknown>;
}
```

Partial refunds are supported. Partial room cancellation is out of scope for MVP.

### `payouts/{payoutId}`

```ts
interface PayoutDocument extends CommonMutableFields {
  partnerId: string;
  propertyId: string | null;
  bookingIds: string[];
  grossPaise: number;
  commissionPaise: number;
  adjustmentsPaise: number; // signed
  netPaise: number;
  bankAccountSnapshot: Record<string, unknown>;
  status: "draft" | "approved" | "processing" | "paid" | "failed";
  reference: string | null;
  paidAt: Timestamp | null;
}
```

Admin creates and marks manual payouts. Only eligible KYC-approved partners may receive payouts.

### `invoices/{invoiceId}`

```ts
interface InvoiceDocument extends CommonMutableFields {
  bookingId: string;
  partyType: "customer" | "partner";
  partyId: string;
  invoiceNumber: string;
  invoiceType: "booking" | "commission" | "refund" | "adjustment";
  amounts: Record<string, number>;
  taxBreakdown: Record<string, number>;
  billingSnapshot: Record<string, unknown>;
  r2ObjectKey: string | null;
  status: "draft" | "issued" | "void";
  issuedAt: Timestamp | null;
}
```

## 10. Wallet, loyalty, and coupons

### `walletAccounts/{uid}`

```ts
interface WalletAccountDocument extends CommonMutableFields {
  userId: string;
  currency: Currency;
  loyaltyBalance: number; // points, not paise
  promotionalCreditPaise: number;
  refundCreditPaise: number;
  status: "active" | "frozen" | "closed";
}
```

### `walletTransactions/{transactionId}`

```ts
interface WalletTransactionDocument {
  walletId: string;
  userId: string;
  balanceType: "loyalty" | "promotional" | "refund";
  direction: "credit" | "debit";
  amount: number;
  sourceType: "booking" | "refund" | "promotion" | "manual_adjustment";
  sourceId: string;
  expiresAt: Timestamp | null;
  status: "posted" | "reversed" | "expired";
  createdAt: Timestamp;
  createdBy: string;
}
```

Wallet transactions are immutable. Balance projections and the ledger entry must change in one server-side transaction.

### `coupons/{couponId}`

```ts
interface CouponDocument extends CommonMutableFields {
  code: string;
  name: string;
  discountType: "fixed" | "percentage";
  value: number; // paise when fixed; basis points when percentage
  maxDiscountPaise: number | null;
  minBookingPaise: number;
  startsAt: Timestamp;
  endsAt: Timestamp;
  usageLimit: number | null;
  perUserLimit: number;
  eligiblePropertyIds: string[];
  eligibleSegments: string[];
  status: "draft" | "active" | "paused" | "expired" | "archived";
}
```

Only admins create/manage coupons.

### `couponRedemptions/{redemptionId}`

```ts
interface CouponRedemptionDocument extends CommonMutableFields {
  couponId: string;
  userId: string;
  bookingId: string;
  discountPaise: number;
  status: "reserved" | "redeemed" | "reversed";
  redeemedAt: Timestamp | null;
}
```

Reserve/redeem in the booking transaction and reverse failed/expired bookings when policy permits.

## 11. Customer activity and reviews

### `wishlists/{wishlistId}`

```ts
interface WishlistDocument extends CommonMutableFields {
  userId: string;
  name: string;
  isDefault: boolean;
  propertyIds: string[];
}
```

MVP uses one default list. Fields allow named lists later.

### `recentlyViewed/{userId_propertyId}`

```ts
interface RecentlyViewedDocument {
  userId: string;
  propertyId: string;
  lastViewedAt: Timestamp;
  viewCount: number;
}
```

### `reviews/{reviewId}`

```ts
interface ReviewDocument extends CommonMutableFields {
  bookingId: string;
  propertyId: string;
  customerId: string;
  ratings: {
    overall: number;
    cleanliness: number;
    location: number;
    staff: number;
    facilities: number;
    value: number;
  };
  title: string;
  comment: string;
  mediaIds: string[];
  status: "pending" | "published" | "rejected" | "hidden";
  partnerReply: {
    text: string;
    authorId: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
  } | null;
  moderatedBy: string | null;
  moderatedAt: Timestamp | null;
  moderationReason: string | null;
}
```

Requirements:

- Only the booking customer may review.
- Booking must be `checked_out`.
- Exactly one review per booking.
- Editing/deleting/hiding a published review recalculates the property rating projection.
- Partner may reply only to reviews for properties they can access.

## 12. Notifications, messaging, and support

### `notifications/{notificationId}`

```ts
interface NotificationDocument extends CommonMutableFields {
  userId: string;
  eventType: string;
  title: string;
  body: string;
  data: Record<string, string>;
  readAt: Timestamp | null;
  status: "created" | "processing" | "completed" | "failed";
}
```

### `notificationDeliveries/{deliveryId}`

```ts
interface NotificationDeliveryDocument extends CommonMutableFields {
  notificationId: string;
  channel: "email" | "sms" | "whatsapp" | "push" | "in_app";
  destinationMasked: string;
  providerMessageId: string | null;
  status: "queued" | "sent" | "delivered" | "failed" | "skipped";
  attemptCount: number;
  sentAt: Timestamp | null;
  deliveredAt: Timestamp | null;
  failedAt: Timestamp | null;
  failureReason: string | null;
}
```

### `notificationTemplates/{templateId}`

```ts
interface NotificationTemplateDocument extends CommonMutableFields {
  eventType: string;
  channel: "email" | "sms" | "whatsapp" | "push" | "in_app";
  locale: string;
  subject: string | null;
  body: string;
  variables: string[];
  status: "draft" | "active" | "archived";
  version: number;
}
```

Core events include booking requested, accepted, rejected, payment succeeded/failed, confirmed, upcoming check-in, cancellation, refund, and review invitation.

Property lifecycle event types: `property.submitted`, `property.approved`,
`property.changes_requested`, `property.rejected`.

### `propertyReviewEvents/{eventId}`

Immutable audit trail of property state transitions (submit, approve, reject,
request changes, pause/resume/archive/restore). Written atomically in the same
transaction as the property mutation. Query per-property newest-first via the
`(propertyId ASC, createdAt DESC)` index.

```ts
interface PropertyReviewEventDocument extends CommonMutableFields {
  propertyId: string;
  actorId: string;               // uid or "system"
  actorRole: "partner" | "admin" | "system";
  action:
    | "submitted" | "approved" | "rejected" | "changes_requested"
    | "paused" | "resumed" | "archived" | "restored";
  fromApprovalStatus: string;
  toApprovalStatus: string;
  fromStatus: string;
  toStatus: string;
  reason: string | null;         // required for rejected / changes_requested
  submissionAttempt: number;     // increments per partner submit
}
```

Related `properties` fields for submission tracking:
`submittedAt` (first submission), `lastSubmittedAt` (most recent),
`submissionCount` (total submissions).

### `conversations/{conversationId}`

```ts
interface ConversationDocument extends CommonMutableFields {
  propertyId: string;
  bookingId: string | null;
  customerId: string;
  participantIds: string[];
  status: "open" | "closed" | "blocked";
  lastMessageAt: Timestamp | null;
}
```

### `messages/{messageId}`

```ts
interface MessageDocument extends CommonMutableFields {
  conversationId: string;
  senderId: string;
  senderRole: Role;
  text: string;
  mediaIds: string[];
  sentAt: Timestamp;
  readBy: Record<string, Timestamp>;
}
```

### `supportTickets/{ticketId}`

```ts
interface SupportTicketDocument extends CommonMutableFields {
  ticketCode: string;
  customerId: string | null;
  partnerId: string | null;
  propertyId: string | null;
  bookingId: string | null;
  category: string;
  priority: "low" | "normal" | "high" | "urgent";
  status: "open" | "in_progress" | "waiting_customer" | "waiting_partner" | "resolved" | "closed";
  assignedAdminId: string | null;
  resolution: string | null;
}
```

### `supportMessages/{messageId}`

```ts
interface SupportMessageDocument extends CommonMutableFields {
  ticketId: string;
  senderId: string;
  senderRole: Role;
  text: string;
  mediaIds: string[];
  isInternal: boolean;
}
```

Only admins may read messages with `isInternal: true`.

## 13. Analytics projections

### `dailyPropertyMetrics/{propertyId_YYYYMMDD}`

```ts
interface DailyPropertyMetricDocument {
  propertyId: string;
  localDate: string;
  timezone: string;
  bookingCount: number;
  confirmedCount: number;
  cancellationCount: number;
  roomNights: number;
  roomHours: number;
  occupancyRate: number;
  grossBookingValuePaise: number;
  commissionPaise: number;
  partnerNetPaise: number;
  averageDailyRatePaise: number;
  checkIns: number;
  checkOuts: number;
  updatedAt: Timestamp;
  updatedBy: "system";
}
```

### `dailyPlatformMetrics/{YYYYMMDD}`

```ts
interface DailyPlatformMetricDocument {
  localDate: string;
  newCustomers: number;
  newPartners: number;
  activeProperties: number;
  searches: number;
  bookingRequests: number;
  confirmedBookings: number;
  conversionRate: number;
  grossBookingValuePaise: number;
  customerFeesPaise: number;
  commissionsPaise: number;
  refundsPaise: number;
  payoutsPaise: number;
  updatedAt: Timestamp;
  updatedBy: "system";
}
```

Update critical counters from booking/payment events and rebuild daily projections with scheduled jobs. Dashboards read projections instead of scanning all bookings.

## 14. Access-control matrix

| Domain | Customer | Partner | Admin |
|---|---|---|---|
| User/profile | Own only | Own only | All |
| Properties | Read active | Membership-scoped writes | All |
| Inventory/rates | Read through search API | Own/membership properties | All |
| Bookings | Own bookings | Property bookings | All |
| Payments/refunds | Own safe view | Property settlement view | All |
| KYC/bank documents | No access | Own private documents | All |
| Reviews | Own create/edit | Reply for accessible property | Moderate all |
| Conversations | Participant only | Participant/property scope | All |
| Support | Own tickets | Involved tickets | All |
| Analytics | No raw partner data | Own property summaries | All |

Firebase rules are defense in depth. Next.js services must repeat authorization checks with Firebase Admin SDK. Admin is unrestricted by product requirement, but every mutation still records `createdBy/updatedBy`.

Suspended users:

- May sign in and view allowed historical data.
- Cannot create bookings, properties, reviews, messages, payment actions, payouts, or mutations except support/account-recovery actions explicitly allowed by the server.

## 15. Required Firestore composite indexes

```text
properties: status ASC, isBookable ASC, address.city ASC, minimumDisplayPricePaise ASC
properties: status ASC, propertyType ASC, ratingAverage DESC
roomTypes: propertyId ASC, status ASC
ratePlans: propertyId ASC, roomTypeId ASC, bookingMode ASC, status ASC
inventoryCalendars: roomTypeId ASC, localDate ASC
bookings: customerId ASC, createdAt DESC
bookings: propertyId ASC, startAt ASC, bookingStatus ASC
bookings: partnerId ASC, bookingStatus ASC, createdAt DESC
payments: bookingId ASC, createdAt DESC
reviews: propertyId ASC, status ASC, createdAt DESC
notifications: userId ASC, readAt ASC, createdAt DESC
propertyMemberships: userId ASC, status ASC
verificationDocuments: ownerType ASC, status ASC, createdAt ASC
dailyPropertyMetrics: propertyId ASC, localDate DESC
```

Generate `firestore.indexes.json` from these requirements and add any query-specific index reported by the Firebase emulator. Do not remove indexes without checking every query.

## 16. Recommended Next.js route boundaries

Exact route filenames may follow the existing project convention. The responsibilities below are fixed.

```text
POST   /api/auth/complete-profile
POST   /api/auth/phone/send-otp
POST   /api/auth/phone/verify-otp

POST   /api/partner/onboarding
POST   /api/partner/properties
PATCH  /api/partner/properties/:propertyId
POST   /api/partner/properties/:propertyId/submit
POST   /api/partner/properties/:propertyId/media/upload-url
POST   /api/partner/properties/:propertyId/documents/upload-url
POST   /api/partner/properties/:propertyId/room-types
POST   /api/partner/properties/:propertyId/rate-plans
PATCH  /api/partner/inventory
POST   /api/partner/bookings/:bookingId/accept
POST   /api/partner/bookings/:bookingId/reject
POST   /api/partner/bookings/:bookingId/check-in
POST   /api/partner/bookings/:bookingId/check-out
POST   /api/partner/bookings/:bookingId/no-show

GET    /api/search/properties
GET    /api/properties/:slug
POST   /api/availability/quote
POST   /api/bookings/hold
POST   /api/bookings
GET    /api/bookings/:bookingId
POST   /api/bookings/:bookingId/cancel

POST   /api/payments/razorpay/order
POST   /api/webhooks/razorpay
POST   /api/refunds

POST   /api/reviews
PATCH  /api/reviews/:reviewId
POST   /api/reviews/:reviewId/reply

POST   /api/admin/properties/:propertyId/approve
POST   /api/admin/properties/:propertyId/request-changes
POST   /api/admin/documents/:documentId/review
POST   /api/admin/reviews/:reviewId/moderate
POST   /api/admin/payouts
POST   /api/admin/payouts/:payoutId/mark-paid
```

Server-route rules:

- Verify Firebase ID token for every authenticated route.
- Load `users/{uid}` and reject unauthorized roles/statuses.
- Check property membership for partner routes.
- Use Zod validation and reject unknown fields for financial/inventory requests.
- Generate an idempotency key for retryable POST requests.
- Recalculate quotes on booking creation and again immediately before confirmation.
- Webhook routes verify provider signatures using the raw request body.
- Return safe DTOs; never send private object keys, internal notes, gateway payloads, or unmasked sensitive data.

## 17. Transaction and idempotency contracts

### Create inventory hold

- Idempotency scope: authenticated user + request key.
- Transaction reads rate plan, property, room type, calendars, and existing key.
- Transaction writes decremented calendars, a hold, and initial booking.
- Repeated identical requests return the original hold/booking.

### Confirm booking

- Triggered only after verified Razorpay success or valid pay-at-property rules.
- Transaction verifies active/unexpired hold and expected payment amount.
- Mark payment paid, booking confirmed, hold converted, coupon redeemed, and create status event.
- Do not decrement inventory again.

### Release inventory

- Release uses the hold ID and affected buckets, not a recalculated current rate plan.
- Release only once; `converted/released/expired` makes retries harmless.

### Razorpay webhook

- Verify signature.
- Create/read `paymentWebhookEvents/{eventId}`.
- If already processed, return success without repeating effects.
- Update payment/booking in a transaction.
- Mark event processed only after successful domain changes.

### Wallet posting

- Unique source key prevents duplicate credits/debits.
- Create immutable transaction and update balance in the same transaction.

### Coupon usage

- Enforce time window, total usage, per-user usage, segment/property eligibility, and booking minimum on the server.
- Reservation and count update are transactional.

## 18. Data retention and deletion

- Use soft deletion for users, profiles, properties, room types, rate plans, policies, media metadata, and content records.
- Never hard-delete bookings, status events, payments, webhook events, refunds, payouts, invoices, wallet transactions, or issued accounting records.
- Account deletion/anonymization and document-retention duration are product/legal decisions still to be finalized.
- Until finalized, preserve financial/legal records and remove public discoverability and authentication access.

## 19. Deferred decisions and explicit defaults

These are intentional defaults, not forgotten requirements:

- Default property timezone is `Asia/Kolkata`; every property still stores its own timezone.
- MVP UI sells one room per booking; `quantity` remains future-ready.
- Instant booking is default; selected hourly or property rate plans may require partner approval.
- Customer may edit guest details before check-in cutoff; date/rate modification and repricing are deferred.
- Partner and admin may request refunds; provider execution remains server controlled.
- Partial refund is supported; partial room cancellation is deferred.
- Identity-document expiry automation is deferred.
- Staff UI and advanced permissions are deferred; membership model exists now.
- Physical room-number allocation is deferred.
- Seasonal/dynamic rate-rule engine is deferred; date-level price overrides exist now.
- Full-text multilingual search engine is deferred.
- Advanced retention/anonymization policy is deferred.
- Separate audit-log collection is out of MVP; actor fields and status events are mandatory.

## 20. Implementation sequence

1. Migrate identity: `users`, `customerProfiles`, `partnerProfiles`.
2. Partner onboarding: properties, translations, amenities, media, verification documents, memberships.
3. Sellable catalog: room types, rate plans, cancellation policies.
4. Availability: calendars, blocks, transactional holds, scheduled initialization.
5. Reservations: bookings, guests, snapshots, status events, partner decision flow.
6. Money: Razorpay order/webhook, payments, deposits, refunds, manual payouts, invoices.
7. Customer loop: wishlists, recently viewed, reviews, coupons, wallet, notifications.
8. Operations: conversations, support/disputes, daily analytics.

## 21. Definition of done for model implementation

Database model implementation is complete only when:

- Shared TypeScript types and server-side Zod schemas exist for all MVP documents and commands.
- Enum constants are centralized; routes do not use ad-hoc status strings.
- Firebase Admin SDK repository/service modules own privileged access.
- Firestore security rules match the access matrix.
- `firestore.indexes.json` covers required queries.
- Firebase emulator tests cover role access and forbidden client writes.
- Transaction tests cover overlapping hourly/overnight inventory, hold expiry, duplicate requests, payment-webhook retries, cancellation release, coupon races, and wallet duplication.
- Money is integer paise everywhere.
- Historical snapshot tests prove later property/rate/policy edits do not change existing bookings.
- Sensitive R2 media is delivered only through authorized short-lived signed URLs.

Do not begin feature UI implementation until the relevant model, validation, authorization, transaction, and test contract is in place.

## Partner reservations operational extension (2026-10-31)

Reservations now explicitly extend the MVP with optional physical room allocation,
immutable property collections, staff notes and pre-check-in amendments. Existing
booking/payment statuses and room-type sellable capacity remain authoritative.

- `physicalUnits/{id}`: propertyId, roomTypeId, label, status (`active`/`inactive`),
  actor/timestamps. IDs are immutable. `physicalUnitLabels/{hash(property + normalized label)}`
  claims enforce label uniqueness transactionally, including renames.
  Room type is immutable; deactivation cannot remove an active assignment.
- `physicalUnitBulkOperations/{previewId}`: server-only bulk room-number preview and
  durable retry receipt. Stores propertyId, roomTypeId, actorId, labels (1–100,
  maximum 40 characters each), register/capacity version digest, createdAt and
  expiresAt (30 minutes). On completion stores result `{ previewId, count, unitIds }`
  and completedAt. The server-generated previewId is the stable retry key; completed
  receipts are retained so a lost response can be retried without creating rooms again.
  Only the same actor with current `rooms.manage` access to that hotel may use it.
  Preview/create use `/api/partner/physical-units/bulk` POST with action `preview`
  (propertyId, roomTypeId, source: range start/end or list text) or `create`
  (propertyId, previewId). Ranges retain leading zeros; lists accept commas/newlines.
  Both actions check permissions, room-type scope, hotel-wide case-insensitive labels
  (including inactive rooms) and active room-type capacity transactionally. Existing
  labels and repeated inputs are reported and skipped; inactive matches stay inactive.
  Create requires an unexpired matching register/capacity digest, never truncates,
  and writes all new units, uniqueness claims, retry receipt and a `room_numbers_added`
  PMS activity event atomically. A changed register requires a fresh preview.
  Neither action writes sellable inventory, bookings, assignments or maintenance.
- `physicalUnitCalendars/{unitId_date}`: propertyId, unitId, date, slots mapping
  15-minute UTC slot keys to booking IDs (including cleaning buffer). Assignment
  checks and old/new calendar writes are transactional. Historical calendars remain;
  cancellation/no-show releases the allocation; checkout retains the scheduled buffer.
- Bookings add optional `physicalUnitId`, `physicalUnitLabel`, `physicalAllocations`,
  `reservationRevision`, `originalPropertyPaidAt`, `propertyRefundedPaise` and `propertyLedgerPaise` (net collections less reversals,
  excluding refunds). No physical register is generated or inventory engine changed.
- `propertyPayments/{id}`: immutable propertyId, bookingId, type (`collection`,
  `reversal`, `refund`), amountPaise, method, reference, reason, receiptId, actor,
  createdAt. Idempotency IDs hash actor + booking + request key. Property refunds
  reference a collection; refunds and reversals cannot exceed its unspent funds.
  `paymentAttempts` remains reserved for provider-verified captures.
- `bookings/{id}/events` stores lifecycle/activity events, append-only private staff
  notes (`type: staff_note`, text, actorId, createdAt), payment and amendment events.
  Staff notes are available only through authorized partner operational endpoints.
- Amendment previews are signed, expire after five minutes, and bind the request,
  current booking revision/update timestamp and authoritative quote. Confirmation
  rereads property/room/rate/policy/hold/calendars transactionally; dates, inventory,
  totals, snapshots and revision update together. Only future confirmed interval_v1
  bookings can be amended. Existing extras must be resolved before amendment.
  Original booking and quote are retained in the amendment event. Currency and
  guest identity do not change. Outstanding differences are collected at property;
  refundable excess is tracked separately until returned against a receipt.
- Existing historical property payments are not fabricated or assigned new capture
  dates. Their amounts remain visible, but receipt-based reversal/refund requires
  reconciliation where no identifiable receipt exists.
- Collections, allocation and amendments have independent server feature flags:
  `PARTNER_RESERVATIONS_PAYMENTS`, `PARTNER_RESERVATIONS_ALLOCATION`,
  `PARTNER_RESERVATIONS_AMENDMENTS`. Local development/test defaults on; production
  defaults off until indexes are ready. Read-only history remains available.

Reservations list indexes cover the combinations of property, exact search token,
booking status, room type, payment status and hourly mode, ordered by checkIn and
checkOut descending with a document-ID tie breaker. Aggregate counts use the same
constraints. Embedded request/balance predicates and legacy overnight-mode matching
are evaluated over bounded indexed candidates (maximum 10,000); exports use that
same explicit maximum and fail with a request to narrow the range rather than
returning a truncated file. Physical assignment uses the same 15-minute UTC slots
as inventory. Manual bookings recorded as paid create property-payment receipts in
the booking transaction. Provider cancellation refunds exclude net property
collections and property refunds, preventing mixed payment sources from inflating
provider refund amounts.

### Room calendar and housekeeping extension

- `rateDatePrices/{sha256(propertyId + NUL + ratePlanId + NUL + date)}` stores an absolute nightly price or complete hourly duration table for a property-local date. `datePricingEnabled` on a rate enables reads; once enabled, consumers always respect saved overrides, even if editing is disabled. No existing booking snapshots are rewritten.
- `roomBulkPreviews/{uuid}` binds the actor, property, cells, source revisions and five-minute expiration. Applying is transactional and idempotent. Expired previews can be removed with a TTL policy on `expiresAt`; enforcement does not depend on TTL cleanup.
- `physicalUnits` gains optional `housekeepingStatus`, note, updater, timestamp and `revision`; missing status means unknown. Cleaning events are under the unit's `events` subcollection. Checkout records dirty status transactionally.
- Numbered-room maintenance reuses `inventoryBlocks`, adding optional `unitId` and idempotency fingerprint. The same transaction reserves room-type blocked capacity and physical calendar slots identified as `maintenance:<blockId>`. Release removes only that block's slots/capacity.
- Property `roomEvents` stores bulk edit audit records. New collections are server-only; existing default-deny client rules apply.

## Partner PMS foundation (2026-11-13)

This additive extension implements partner-wide PMS preparation, not a complete front desk or accounting system.

- Membership IDs remain `{propertyId}_{uid}`. Fixed roles are owner, manager, receptionist, cashier, housekeeper and maintenance. Server role presets are authoritative; arbitrary client permission arrays never grant access. `accessRevision` increments on role/access changes. Primary ownership cannot be changed through staff management.
- `propertyInvitations/{id}` stores propertyId, normalized email, staff role, SHA-256 tokenHash, pending/accepted/cancelled status, expiresAt, acceptedBy and actor/timestamps. Raw tokens are returned only on creation/rotation; links carry tokens in the fragment. Acceptance requires the matching Firebase-verified email and atomically grants membership and the existing partner application role. Expiry is enforced without TTL.
- `properties/{id}/pmsEvents/{id}` is append-only team/activation/marketplace history, with actorId, type, targetId, before/after and createdAt. Never store invitation secrets in events.
- `properties.pms` stores version 1, activatedAt/By, ownerDisabled, adminDisabled, adminReason, openingData (`none` or `external`), teamReviewed and actor/timestamps. Ready is derived from saved setup and inventory integrity, never a user-supplied status. External opening reservations/balances block readiness; imports and manual overrides are not implemented.
- `properties.marketplaceOwnerPaused` is an independent voluntary public-sales pause. It never clears admin pause/suspension/archive/revoked approval. Public bookability remains server-derived. Internal commands may bypass public publication only through an explicit authorized, ready PMS context; prices, time rules, holds and shared capacity remain unchanged.
- Staff/private DTOs and notifications are permission-filtered. Customer ownership never follows the operator UID on `manual_partner` reservations. Existing genuine customer records retain their behavior.
- Missing PMS settings preserve existing owner marketplace workflows. Once activated, disabled/incomplete PMS cannot fall back to those workflows. Owners can always access setup/team recovery controls while their account remains eligible; admin restrictions prevent operational commands.
- Revocation is enforced on each server request and transaction. Visible clients revalidate at most every 15 seconds and clear private state on account/access changes; no promise of instantaneous erasure of information already viewed or downloaded is made.

### Phase 1 corrections: readiness checkpoint and cashier lookup

- `properties.pms.inventoryVerification` is a server-only checkpoint with `passed: boolean`, `checkedAt: Timestamp`, and `checkedBy: uid`. Activate, resume, save opening declarations and explicit Verify inventory commands reconcile inventory in a consistent transaction and save the result. Clients cannot submit a result. Existing activated hotels without this checkpoint must have an owner run Verify inventory (or save setup declarations) once; no live records are migrated automatically.
- Routine readiness checks read current room/rate/register/policy configuration and the saved verification result, never reservation/hold/calendar history. The result is a setup checkpoint, not a claim that a full audit runs on every operation. Existing transactional checks for the affected inventory, assignments, collections, reversals and refunds remain authoritative. Full explicit verification is paginated without an arbitrary historical-document ceiling; it preserves and checks historical calendar counters and committed holds, reads active bookings and resolves historical hold identities. It does not rewrite or repair financial/inventory records.
- Cashier department GET accepts an exact booking ID/reference or a signed, account/property-bound cursor for outstanding-balance pages. Each page inspects at most 50 eligible reservations; paid candidates can produce an empty page with a next cursor. Exact lookup includes older/settled bookings for receipt corrections, uses property-scoped reference queries, and never returns guest contacts or raw provider/booking documents. New indexes are additive.
- Same-account foreground identity checks hide retained private UI until verification succeeds without clearing drafts or remounting it. Failed verification offers a retry. Actual account changes/logout still cancel queries, clear private drafts/caches and reject stale responses; an account verification dialog also covers portalled private UI.

## Phase 2A walk-in and identity extension

- Internal manual requests add `reservationPurpose: reservation | walk_in` and a hotel-local `recordedArrivalTime`. Walk-ins use the server's current hotel date, never a previous night. `properties.pms.allowEarlyWalkIns` defaults false and is owner-controlled. Enabled early walk-ins reserve actual occupancy from arrival and charge full calendar-night prices; departure is always explicitly reviewed. Public timing rules remain unchanged.
- Manual bookings add `identityVersion: 2`, `createdByStaffId`, `reservationPurpose`, `recordedArrivalAt` (UTC ISO), `occupants` (known names/age groups only), `registrationIncomplete`, `guestProfileId`, and `linkedCustomerId` (null until verified). `guestId` is null until verified customer linking, never the operator. `bookingContact` is independent. Existing booking snapshots, allocations, receipts and history are preserved.
- `properties/{id}/guestProfiles/{id}` stores hotel-scoped lead name/contact and booking IDs; no global contact lookup or automatic contact-based merging. Booking occupant updates require reservation.note and a revision; events preserve previous details.
- `bookings/{id}/customerLinks/current` stores normalized recipient email, tokenHash, pending/accepted/cancelled state, seven-day expiresAt, actors and acceptedBy. Raw secrets exist only in returned fragment links. Verified matching Firebase email and explicit acceptance atomically set linkedCustomerId/guestId and append history. No arbitrary UID or contact matching grants ownership. Legacy manual records are never claimed automatically; this flow requires identityVersion 2.
- Checked-in walk-ins retain the recorded actual arrival and separately save checkInRecordedAt. Both creation and check-in are explicit actions. Inventory includes every overlapping UTC quarter hour and cleaning buffer. Historical review tooling is read-only.

Phase 2A manual preview is `POST /api/partner/bookings/quote` with the same stay/purpose/arrival inputs and reservation.create permission. Saving accepts additive `expectedStartAt`, `expectedEndAt`, `expectedTimezone` and existing expectedTotalPaise; the current UI submits all reviewed values and must explicitly review changed terms before retrying. Creation still revalidates the effective rate, policies and allocation inside its existing transaction. Guest registration uses revision-checked partner GET/POST guest-registration; customer invitation issue/cancel is partner POST customer-link, and verified preview/explicit acceptance is customer POST customer-link with token and accept flag. These endpoints never accept an arbitrary linked UID.

The partner guest-registration GET also returns a safe `customerInvitation` summary (status, recipient email and ISO expiry). Pending links whose deadline passed are reported as expired. It never returns a token or tokenHash; reopening a reservation can cancel a pending invitation without recovering its secret. No collection or index changes are required.

## Phase 2B creation, advances and physical assignment (2026-11-14)

- Manual creation accepts optional `initialCollectionPaise` (safe integer, zero through the server-verified final total) and nullable/optional `physicalUnitId`. Legacy paid/unpaid fields still map to full/zero collection when the explicit amount is absent. Existing role presets are unchanged: positive amounts require payment.collect; assignment requires reservation.assign. Existing allocation/payment deployment switches remain effective.
- The existing booking transaction creates the reservation, shared capacity allocation, optional physical calendars/assignment, initial propertyPayments collection and activity events atomically. Complete every read/check before executing assignment/calendar/payment writes. Initial receipt ID remains `{bookingId}_initial`; repeated actor/key/input produces exactly one record set. Amounts update paidPaise/propertyLedgerPaise/balanceDuePaise and existing payment statuses; these are hotel-recorded collections, never provider captures.
- Manual quote can include a first page of safe physical-room options and an opaque cursor scoped to actor, hotel, room type and evaluated interval. Only reservation.assign users with allocation enabled receive room options. Each page is at most 50 matching units. Physical availability includes the complete stay/turnover interval, active maintenance and current occupied/overdue rooms for immediate arrivals. Dirty/unknown cleaning is advisory, not an override or new lifecycle gate. Future cleanliness is not a readiness promise. Selected rooms are revalidated at creation and are never silently substituted.
- Creation success returns an additive saved financial/assignment summary. Activity history reuses bookings/{id}/events; no folio, invoice, new financial ledger, automatic check-in or historical migration is introduced.
- Two additive composite indexes are required before rollout: physicalUnits `(propertyId ASC, roomTypeId ASC)` and physicalUnitCalendars `(propertyId ASC, unitId ASC, date ASC)`. Physical calendar preview uses sparse range queries in batches of 20 units; transaction saves still check canonical calendar documents directly. See `PMS_PHASE2B.md` for rollout, compatibility and local verification results. Indexes were added to source only, not deployed.

### Phase 2C: Today read model

Today adds no collections or historical backfill. It derives private queues from active bookings, separately queried selected-date completed bookings, physicalUnits and active inventoryBlocks. See [PMS_PHASE2C.md](PMS_PHASE2C.md) for predicates, permission projection, limits, cursor binding and refresh semantics. The bookings composite indexes for selected checkIn/checkOut with propertyId and bookingStatus are declared in firestore.indexes.json; release provisioning remains a separate step.

Phase 2C cache correction: operational transactions collect affected hotel IDs in memory and advance the hotel's partner-today Redis generation only after a successful Firestore commit. Retry attempts cannot publish discarded hotel scopes; no additional Firestore documents/fields or lookup reads are required. Hotel-specific generations invalidate every date/queue evaluation for that hotel without clearing other hotels. Worker bundles must be rebuilt/restarted with the shared transaction helper.

## Phase 2D: current hotel operational policies

`properties.pms.operationalPolicies` optionally stores `requireAssignedRoom`, `requireCleanRoom`, `requireGuestRegistration`, and `requireSettledBalance` booleans, plus integer `revision`, `updatedBy`, and server `updatedAt`. Missing booleans resolve to false. Owner `setup.manage` saves require the current policy revision and append `pms_operational_policies` before/after values to the existing `properties/{id}/pmsEvents` history. Policy saves invalidate the hotel's Today cache after commit. They do not activate policies or change setup readiness automatically.

Current hotel policies apply to subsequent actions on existing and new reservations. Assignment/cleaning gates validate the room's property, type, active status, physical-calendar conflicts, current checked-in occupancy and overlapping active maintenance. Cleaning accepts only clean/inspected and independently requires assignment. All dependencies are read within the lifecycle transaction before writes.

Registration checks saved staying names by adult/child/infant counts, independently of documents, verification and pre-check-in. Phase 2A `identityVersion: 2` occupants remain canonical. Customer bookings can explicitly save `occupants` with `registrationVersion: 1`, preserving their identity version, customer ownership, contacts and linking. Original customer adultGuestNames remain usable until an explicit registration edit. Customer edits do not create guest profiles or invitations. Existing guest_registration events preserve before/after occupants. Ambiguous historical manual identities remain protected; no correction workflow is introduced.

Checkout uses only `stayFinancials(booking).balanceDuePaise`: booking total less credits and net received money after refunds/reserved refunds. Bundled charges remain included; pending captures and separately settled services remain excluded. No new ledger, allocation rule or write-off is introduced.

Partner lifecycle status POST additively accepts `expectedEligibilityVersion` and `idempotencyKey` (or Idempotency-Key header). Actor/key hashes address `bookings/{id}/lifecycleReceipts/{hash}` with action, actorId and server createdAt. The same hash identifies keyed lifecycle events and checkout housekeeping events. Successful replays reauthorize and recover without repeating side effects; keys cannot cross actions. Unkeyed existing clients still receive authoritative checks. Structured errors optionally carry eligibility with allowed, blockers, compatibility reason and opaque eligibilityVersion: permission/restriction 403, state/stale 409, policy 422. No override is available.

See [PMS_PHASE2D.md](PMS_PHASE2D.md) for operational contracts, limitations and verification. No new index or historical migration is required by this phase; previously declared Phase 2B/2C indexes remain part of release preparation.

Phase 2D read correction: shared pure collection/assignment/amendment restrictions now serve both read eligibility and authoritative commands. Read-only page eligibility uses a bounded, request-local dependency context with batched bookings/units/calendars and one projected occupancy/maintenance query per page. This context is never supplied to write transactions. No persisted schema, policy default or index changes are required.

### Phase 3A reservation billing contract

`bookings/{id}/billingEntries/{id}` is server-only, immutable history for final agreed hotel charges and explicit credits, corrections and voids. Never copy original booking prices, booking credits or service agreements into this collection. Integer paise only; categories imply no tax treatment. `billingNetPaise` and `billingRevision` on the booking are transactional projections of these entries. `billingOpenCount` counts original entries with a nonzero remaining amount, including credits; cancellation/no-show requires every entry neutralized explicitly.

Effective reservation charges = original `totalPaise` − authoritative `customizationCreditPaise` + `billingNetPaise`. Original prices and provider orders remain unchanged. Balance uses existing pending-refund rules. Reservation receipts come from `propertyPayments` and captured `paymentAttempts` excluding `stayQuote`; reversals link to original receipts and reduce received money. `refunds` link via `paymentId`; reserved and completed amounts are distinct. Preserve booking aggregates when ledger history disagrees and warn; never synthesize balancing records. Block new posting/collection when reservation reconciliation is unresolved; receipt recovery remains available.

Supplemental services remain a separate pool: accepted request agreements and `stayPaymentReceipts`, deduplicated by payment identity for combined offers. Unaccepted requests, estimates and declined/cancelled quotes are informational. Overall statement labels both pools without cross-pool collection. Read operations require `payment.read`; posting and adjusting require new `billing.post` and `billing.adjust` (owner/manager only). Cashiers retain restricted payment access. Reasons and internal records stay private. Commands require revision and deterministic idempotency identity, with atomic compensating/replacement entries. No percentage discounts, invented taxes, historical backfill, provider-order enlargement or deployment.

Billing entries include `actorName` as a posting-time display snapshot alongside authoritative `actorId`. Root charges/credits use a signed amount, and a correction/void appends an exact opposite `compensation` referencing its root; corrections also append a replacement root. Request receipts at `bookings/{id}/billingRequests/{sha256(uid,booking,key)}` store the parsed-payload fingerprint and committed result. A reused key with a different payload conflicts. Replays still require current hotel authorization. Zero net billing alone does not clear cancellation review: equal charge/credit roots must each be explicitly neutralized.

The folio GET uses one consistent transaction, paginates the returned entry history by stable revision/entry identity, and returns capability flags. Incomplete original component snapshots are notices, not fabricated zero amounts. Conflicting ledger totals are blockers for posting, collection and balance-policy checkout; receipt reversal/refund recovery remains available. Display and checkout balances reserve pending refunds; the existing collection ceiling uses actual net receipts and separately rejects pending refunds. Supplemental warnings do not transfer or offset reservation money.

Statement reads require both displayed `billingRevision` and a digest of the reconciled source model, so new receipts/refunds invalidate printing even when entry revision is unchanged. The statement returns the same authorized model with all entries. No new composite indexes are needed: billing children and existing receipt queries use document/single-field indexes. Application and booking/refund workers must be upgraded together before release; existing Phase 2 indexes must be ready. No publication or backfill is part of implementation.

Folio DTOs annotate sources with stable `sourceId` values (`billing_entry/{id}`, `property_payment/{id}`, `provider_payment/{id}`, `provider_refund/{id}`), preserving original receipt IDs for links and distinguishing identical request IDs in different collections. The review UI sends optional `expectedStatementVersion` with commands to reject source changes that do not advance billing revision. Completed hotel returns appear in the Refunds view alongside provider refunds; History combines the same reconciled sources without moving money between pools.

## Phase 3B — hotel-issued immutable documents (additive invoice contract)

The existing `invoices` contract above also supports server-created hotel accounting snapshots with `contract: "hotel_v1"`. Legacy commission/booking invoice records do not count as hotel source claims. Hotel documents have `status: "issued"`, `invoiceType: "booking" | "adjustment"`, `documentType: "ordinary_invoice" | "tax_invoice" | "credit_note"`, `propertyId`, `bookingId`, `invoiceNumber`, hotel-local `date`, Indian `financialYear`, immutable `seller`, explicit `customer`, `lines`, signed `taxBreakdown`, `amounts.totalPaise`, `totalPaise`, `settingsRevision`, `detailsRevision`, `reviewedVersion`, `issuerId`, `issuerName`, `issuedAt`, `settlementAtIssuance`, and nullable `original`, `reason`, `reductionId`, `r2ObjectKey`. Credit notes retain original document ID/number/date. There is no update, delete, void or replacement route for these documents. Printed copies come exclusively from this snapshot and include a signature space.

Private server-managed data:

- `properties/{id}/invoiceConfiguration/current`: revision, accountant-confirmed India settings, legal identity, registration treatment, GSTIN/state, IRP applicability, contact, authorized signatory/designation, footer, separate series/starting numbers and a `used` lock. `history/{revision}` stores before/after, actor and timestamp. After first use, series, starting numbers, registration treatment and GSTIN cannot change.
- `…/invoiceConfiguration/current/sequences/{sha256(series,financialYear)}`: next consecutive number. The full number is `series/YYZZ/counter`, limited to 16 alphanumeric, slash or hyphen characters. Server hotel-local issuance dates select April–March financial years. Separate series have independent counters. A failed transaction consumes no number; a new financial year has its own sequence. There is no reset/backdate endpoint.
- `bookings/{id}/invoiceWorkspace/details`: explicit recipient, accountant attestation, transaction IRP applicability, per-source quantity/unit, description/SAC, taxable value, CGST/SGST/IGST amounts/rates, place of supply, seller confirmation and provenance. Revision-controlled before/after history is under `history/{revision}`. These annotations cannot mutate money or guest/customer ownership.
- `bookings/{id}/invoiceWorkspace/state`: source-to-cumulative `claims`, source-to-documentation `reductionClaims`, and original invoice-line-to-component `credited` caps. This document serializes all document claims for a reservation. It is also read by folio correction/void transactions to prevent reversal of documented reductions.
- `bookings/{id}/invoiceRequests/{sha256(bookingId,actor,key)}`: canonical parsed-payload fingerprint and immutable result receipt. Exact-key retries return the original result after current access checks; changed payloads conflict. Booking audit events record issuance without changing financial projections or Today counts.

Sources are the original accommodation snapshot, exact included extra snapshots (`extra:{requestId}`), and stable billing correction families (`entry:{firstRootId}`). Booked-extra totals and explicitly declined-extra credits must reconcile to their existing booking projections. Compensations and replacements are netted within the original family; gross compensation is never a reduction entitlement. Separately quoted services and platform/customer fees do not acquire hotel ownership from payment receipt. Nonzero customer fees block hotel issuance until supported source ownership exists. Each source requires explicit seller confirmation and exact accountant-confirmed particulars; the server never reverses inclusive totals or splits aggregate taxes. Original booking tax particulars must agree with the existing tax amount when present. Unsupported source history blocks issuance.

The first invoice can show already-saved generic credits as signed, explicitly annotated lines. Subsequent invoices claim only new positive source amounts. Later reductions require linked credit notes with explicit original-line allocations. Component and total caps and source-reduction entitlement are checked in the same transaction as sequence reservation, snapshot, receipt and audit writes. Credit notes do not create folio entries, payments, refunds, notifications or settlement-provider calls. Current refund status is read from the existing money model.

Authorization is independent: `invoice.settings`, `invoice.issue`, `invoice.credit` belong to owners/managers; `invoice.read` additionally belongs to cashiers. All API, document and HTML print routes recheck booking/hotel scope and permissions. Issuance requires current operational access, activation, administrative eligibility, supported booking state and a matching reviewed dependency digest. Historical reading remains available to authorized staff when new operational writes are restricted. Firestore clients remain denied by the existing catch-all rules.

Queries use existing automatic single-field indexes (`invoices.bookingId`, history `revision`) and direct document references. No new composite indexes or index publication are required. No migration, backfill, live issuance or deployment is part of this change.

Supported requirements and limitations: India, unregistered ordinary invoices without GST collection/ITC claims, and accountant-confirmed registered taxable supplies using CGST/SGST or IGST and per-line nearest-paise rounding. Composition, exemptions, zero-rated/export treatments, cess, reverse charge, foreign jurisdictions, IRP-required documents, debit notes and non-monetary corrections of issued particulars remain unavailable. No hotel-size/booking-value registration inference is made. Hotel/accountant confirmation and signature/return-filing review remain required; this feature does not certify legal compliance or perform IRP registration.

Official legal references checked for Phase 3B: [CBIC Rule 46](https://taxinformation.cbic.gov.in/content-page/explore-rules/1000136/1000001), [CBIC Rule 53](https://taxinformation.cbic.gov.in/content-page/explore-rules/1000144/1000001), and [GSTN e-invoice/IRN FAQs](https://www.gstn.org.in/faqs-category-details). The direct pages intermittently timed out during research; indexed official CBIC/GSTN content confirmed the numbering and original-document/IRN requirements. Confirm applicable current requirements with the hotel accountant before use.

## Phase 3C: in-house assignment history and stay-change receipts

Checked-in stays may have matching `assignmentSegments` arrays on `bookings/{bookingId}` and `inventoryHolds/{bookingId}`. Each segment has `{ id, changeId, closedByChangeId?, unitId, unitLabel, roomTypeId, roomTypeName, startAt, endAt, inventoryEndAt, allocations: [{ date, intervals }] }`. Intervals remain the existing hotel-date-grouped 15-minute UTC slot keys. A category counter counts each segment's allocation, including overlap between old-room turnover and destination occupancy. Physical calendars retain exact booking ownership. Array order is chronological; occupancy segments are contiguous. Turnover can overlap occupancy in another room.

No bulk conversion occurs. Existing holds continue to use `{ roomTypeId, allocations, quantity, status }` until an explicit authorized stay change. On a changed hold these fields project the current segment, while `assignmentSegments` is the complete allocation authority. `originalAllocationEvidence` preserves the pre-change category and allocations. Aggregate readers MUST use `holdAllocationGroups`; physical readers use `physicalAllocationGroups`. Reconciliation/setup verification checks both formats and does not repair records automatically.

Booking current projections (`roomType`, `physicalUnitId`, `physicalUnitLabel`, `physicalAllocations`, `endAt`, `inventoryEndAt`, `checkOut`, `departureTime`, `durationMinutes`, `nights`, `cleaningBufferMinutes`) drive operational consumers. `originalStay` preserves the initial room/category/departure; original quote, original booked total, rate and provider snapshots remain financial evidence. `operationalRatePlanId` may identify the rate used for a subsequent extension without replacing the original `ratePlan` snapshot. Customer saved details expose current room/departure separately from original room/departure.

`bookings/{bookingId}/stayChangeRequests/{changeId}` stores `{ payloadHash, result, actorId, createdAt }`. Change IDs are stable hashes of actor/booking/idempotency key. Signed five-minute reviews bind account, hotel, booking, command input and transaction dependency fingerprint. Confirmation requires a reason. Receipts are created atomically with segment changes, inventory deltas, projections, immutable billing entries and audit/housekeeping events. Exact replay requires current authorization; a changed payload conflicts.

`billingEntries/{changeId}` adds `stayChangeId` and, for agreed accommodation credits, `reductionSourceId` (`booking` or an eligible `entry:<id>` accommodation source). Linked credits net against the original source for credit-note follow-up. Corrections/compensations preserve those source links; documented reduction reversals require an unsupported debit note and are rejected. Calculated extension particulars may be retained under `details.pricing`; manually agreed final amounts do not imply tax. No automatic invoice, credit note, collection or refund is created. Immutable issued document snapshots and original line references are unchanged.

Only owners/managers have `reservation.category`, `reservation.extend` and `reservation.early_departure`. Receptionist same-category moves reuse `reservation.assign`. Pricing and financial permissions are checked separately; payment figures and reduction sources remain hidden without their existing financial permissions. The previous assign endpoint cannot replace checked-in history.

Current stay/allocation limits remain 30 overnight nights, 24 hourly hours, 32 allocation days including turnover, with stricter rate limits honored. A maximum of 60 room segments is supported. Quantity/group or inconsistent historical records are explicitly blocked with reconciliation guidance. See [Phase 3C](PMS_PHASE3C.md) for timing, pricing, commit/recovery semantics and the disabled-by-default release gate. Phase 3D is cashier shifts and reconciliation.

### Phase 3D–3E: cashier shifts and daily closing

Authoritative server-only collections (browser writes remain denied):

| Collection | Deterministic identity / purpose |
| --- | --- |
| `cashierShifts` | SHA-256 opener/hotel/open-request key; open projection and immutable closing snapshot. Hotel/opener, opening date/time/timezone, server-owned cash totals/source count/revision, closed actor/date/time and reviewed source IDs/count/difference/reason. |
| `cashierActiveShifts` | SHA-256 hotel/staff tuple; at most one active shift pointer per staff member per hotel. Cleared atomically on own-shift closure. |
| `cashierShiftRequests` | SHA-256 actor/hotel/key; canonical fingerprint and permanent replay result. |
| `hotelClosingState` | Hotel ID; shared commit revision, first-shift reporting start/date/timezone and last consecutive closed date. Every shared operational/financial transaction increments the revision. |
| `dailyClosings` | SHA-256 hotel/date; immutable reviewed activity, separate shift summaries, outstanding-work snapshot, covered source identities, actor/timezone/server close timestamp/note/acknowledgement/version. |
| `dailyClosingRequests` | SHA-256 actor/hotel/key; fingerprint and permanent exact request receipt. |

Eligible new cash `propertyPayments` reference `shiftId` and signed `cashEffectPaise`. Same-open-shift reversals reduce collections; corrections of earlier/closed cash receipts carry zero physical effect and `correctionOfShiftId` (null for unattributed history). Cash refunds are actual returns. Historical receipts are never attributed automatically. Noncash and provider money retain their existing ownership and records.

Daily reporting begins at first shift activation, uses the recorded hotel calendar timezone, closes dates consecutively, and never locks operations. Covered source keys include collection/document ID and a processed stage for completed provider refunds. Uncovered earlier source-dated items appear once in subsequent reports' late-activity section. Existing reports and outstanding-balance snapshots never change or accumulate into later balances. Incomplete or over-limit history blocks reporting.

See [PMS_PHASE3D_3E.md](PMS_PHASE3D_3E.md) for source/date definitions, exact bounds, reversal semantics, transactions, recovery, permissions, print authorization and flag/index/application/worker release order. Both deployment flags default off; no backfill or production enablement is part of this phase.
