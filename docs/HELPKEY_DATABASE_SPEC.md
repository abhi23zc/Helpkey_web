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
  durationMinutes: number | null; // required for hourly plans
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

`inventoryCalendars` contains one document per room type per property-local calendar date with 24 hourly capacity buckets. Hourly bookings consume their overlapping buckets. Overnight bookings consume every bucket between check-in and checkout. This prevents selling the same room-type capacity to both booking modes at the same time.

### `inventoryCalendars/{roomTypeId_YYYYMMDD}`

```ts
interface InventoryCalendarDocument extends CommonMutableFields {
  propertyId: string;
  roomTypeId: string;
  localDate: string; // YYYY-MM-DD in property timezone
  timezone: string;
  capacity: number;
  availableByHour: [number, number, number, number, number, number,
                    number, number, number, number, number, number,
                    number, number, number, number, number, number,
                    number, number, number, number, number, number];
  blockedByHour: [number, number, number, number, number, number,
                  number, number, number, number, number, number,
                  number, number, number, number, number, number,
                  number, number, number, number, number, number];
  priceOverrides: Record<string, number>; // ratePlanId -> paise override
  stopSellRatePlanIds: string[];
  version: number;
}
```

### `inventoryHolds/{holdId}`

```ts
interface InventoryHoldDocument extends CommonMutableFields {
  bookingId: string;
  userId: string;
  propertyId: string;
  roomTypeId: string;
  ratePlanId: string;
  startAt: Timestamp;
  endAt: Timestamp;
  quantity: number;
  status: "active" | "converted" | "released" | "expired";
  expiresAt: Timestamp;
  calendarDates: string[];
  idempotencyKey: string;
}
```

Default hold duration: 10 minutes. TTL cleanup is secondary; every mutation must treat a hold as expired when `expiresAt <= now`, even if Firestore TTL has not deleted it.

Inventory transaction algorithm:

1. Convert requested `startAt/endAt` into the property timezone.
2. Determine every overlapping local date and hour bucket.
3. Read all required calendar documents in one Firestore transaction.
4. Verify active rate plan, booking window, capacity, stop-sell rules, and `availableByHour >= quantity` for every bucket.
5. Decrement exactly the overlapping buckets.
6. Create an active hold with a unique idempotency key and the affected dates.
7. On confirmation, mark the hold `converted`; do not decrement inventory again.
8. On failure, expiry, rejection, or eligible cancellation, increment exactly the buckets consumed by that hold and mark it released/expired.

Examples:

- Hourly booking 10:00–13:00 consumes hours 10, 11, and 12.
- Overnight booking day 1 14:00 to day 2 11:00 consumes day 1 hours 14–23 and day 2 hours 00–10.
- Maintenance 09:00–17:00 blocks hours 09–16.

Create calendars 365 days ahead with a scheduled job and lazily create missing dates during server-side search/booking. Cap maximum MVP stay length so the transaction remains within Firestore limits.

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
  startAt: Timestamp;
  endAt: Timestamp;
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
