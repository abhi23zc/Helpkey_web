# Helpkey API inventory for mobile implementation

Reviewed: 10 November 2026. Source: the route exports in the local `web/app/api/` tree, including the delegated partner stay-request GET export. This inventory describes code availability, not deployed endpoint verification.

**95 route files, 121 exported method/path combinations.** The existing app calls 17 of these route paths through its HTTP/auth feature modules. A reused endpoint can still have an incomplete mobile request/response model.

[Analysis and findings](/Users/zrf/ABHI/Freelance/Helpkey/web/docs/APP_PARITY_AUDIT.md) · [Implementation checklist](/Users/zrf/ABHI/Freelance/Helpkey/web/docs/APP_IMPLEMENTATION_CHECKLIST.md)

## Shared client contract

- API origin: the deployed Next.js origin in `EXPO_PUBLIC_API_URL`; production mobile URL resolution requires HTTPS. `EXPO_PUBLIC_WEB_URL` can provide a separate public site origin.
- Native requests send `x-helpkey-client: mobile`. This selects native CSRF/session behavior; it does not replace authentication.
- Protected native requests send `Authorization: Bearer <Firebase ID token>`. Firebase refresh tokens stay in secure device storage and are exchanged with Firebase, not sent as API bearer credentials.
- `/api/auth/session` accepts an ID token in its body to create/update the Helpkey profile; the mobile branch does not issue a browser session cookie.
- Most public API success responses are wrapped with `data` and `requestId`; legacy compatibility also repeats fields at the top level. Internal task/health responses have their own shape.
- Errors can be standard `{ error: { code, message, fieldErrors }, requestId }` or legacy forms. Normalize machine codes before implementing branch-specific UX.
- Money is integer paise. Stay dates are property-local calendar dates; instants and property timezone are distinct. Do not infer refund, final amount or inventory state on-device.
- Preserve signed cursors as opaque strings. Expired search cursors require a fresh search.
- Use `Idempotency-Key` for booking creation; revision and quote-version fields protect stay mutations. They solve different problems.
- Signed R2 upload URLs use the returned upload headers and raw bytes, not the JSON API wrapper or Firebase authorization.

## Customer endpoints and important payload notes

| Feature | Request and response notes |
| --- | --- |
| OTP | Send `{ phoneNumber }` in E.164; verify `{ challengeId, otp }`; exchange returned custom token with Firebase. |
| Profile session | POST `{ idToken, fullName? }`; GET me returns the Helpkey user/roles/status. |
| Search | Destination/dates/guests, mode/arrival/duration, place fields, repeated `amenity` and `propertyType`, rating, price bounds, cancellation and sort; returns properties, selected offers, total, facets, timestamps and cursor. Optional `includeClientSnapshot=true` has bounded eligibility. |
| Property | Detail includes public rules, booking modes and timezone. Bookable accepts normalized stay criteria and returns rooms, evaluated rates, hourly price options and freshness metadata. |
| Quote | Property slug, room/rate IDs, stay/guests and optional selections/preferences/unlisted requests; returns authoritative quote and fingerprint. Does not itself reserve inventory. |
| Booking create | Quote inputs plus lead contact, guest names, payment method, terms, optional billing/contact/masked identity, expected amount/fingerprint; response includes booking ID/reference, payment requirement and optional `razorpay` session. |
| Booking detail | Saved booking/terms, guest contact, times, balances/refunds, stay requests and supplemental payments. Requires the booking owner. |
| Original payment | Payment-session returns `{ razorpay: session }`; verify accepts `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`. Confirmation remains server-authoritative. |
| Pre-check-in | GET options/editability; POST full revisioned selection/pre-check-in form; PATCH arrival-only form. Do not substitute one shape for the other. |
| Stay requests | POST unlisted create or guest quote accept/reject; PATCH eligible selection updates. Follow current revision and exact quote version. |
| Supplemental payment | POST `{ requestId, quoteVersion }` returns session fields directly, including `stayQuoteOrderId`; POST signed Razorpay fields to the same route for verification. Distinct from original booking payment. |
| Wishlist | GET paginated `items: [{ propertyId, property }]`, where property can be null. `ids=true` with repeated `propertyId` returns visible-card state. PUT/DELETE are idempotent account writes. |
| Reviews | GET own review and eligibility by property ID; POST/PATCH rating/text. Public review list uses property slug. Completed-stay requirement is server-enforced. |
| Review photos | Authorize upload using filename, MIME, size and SHA-256; upload bytes; finalize `{ uploadId }`; workers handle publication. |
| Notifications | GET supports limit/cursor and `unread=1`; returns feed/unread count/continuation. POST `{ ids }` marks owned notifications read. |
| Privacy request | Public, rate-limited request form returns a reference. Submission is not account deletion. |

## All routes

“App connected” means an existing HTTP call was found in mobile source. “Available” means no matching mobile call was found; it does not prescribe adding that feature to the customer app. Source links lead to the handler; some authentication and authorization live in shared helpers/services.


### admin

| Methods | Route/source | Mobile usage |
| --- | --- | --- |
| GET | [/api/admin/aadhaar-lab/[recordId]/payload](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/admin/aadhaar-lab/[recordId]/payload/route.ts) | Available |
| POST | [/api/admin/aadhaar-lab/[recordId]/resend](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/admin/aadhaar-lab/[recordId]/resend/route.ts) | Available |
| POST | [/api/admin/aadhaar-lab/[recordId]/verify](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/admin/aadhaar-lab/[recordId]/verify/route.ts) | Available |
| GET, POST | [/api/admin/aadhaar-lab](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/admin/aadhaar-lab/route.ts) | Available |
| POST | [/api/admin/bookings/[bookingId]/cancel](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/admin/bookings/[bookingId]/cancel/route.ts) | Available |
| POST | [/api/admin/bookings/[bookingId]/refunds/[refundId]/retry](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/admin/bookings/[bookingId]/refunds/[refundId]/retry/route.ts) | Available |
| GET | [/api/admin/bookings/[bookingId]/timeline](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/admin/bookings/[bookingId]/timeline/route.ts) | Available |
| GET | [/api/admin/bookings](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/admin/bookings/route.ts) | Available |
| GET, POST | [/api/admin/media-publications](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/admin/media-publications/route.ts) | Available |
| GET | [/api/admin/overview](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/admin/overview/route.ts) | Available |
| GET, POST | [/api/admin/projections](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/admin/projections/route.ts) | Available |
| POST | [/api/admin/properties/[propertyId]/assets/[assetType]/[assetId]/review](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/admin/properties/[propertyId]/assets/[assetType]/[assetId]/review/route.ts) | Available |
| GET | [/api/admin/properties/[propertyId]/events](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/admin/properties/[propertyId]/events/route.ts) | Available |
| GET | [/api/admin/properties/[propertyId]/kyc/[documentId]/preview](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/admin/properties/[propertyId]/kyc/[documentId]/preview/route.ts) | Available |
| POST | [/api/admin/properties/[propertyId]/lifecycle](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/admin/properties/[propertyId]/lifecycle/route.ts) | Available |
| GET | [/api/admin/properties/[propertyId]/preview-urls](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/admin/properties/[propertyId]/preview-urls/route.ts) | Available |
| POST | [/api/admin/properties/[propertyId]/review](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/admin/properties/[propertyId]/review/route.ts) | Available |
| GET, PATCH, DELETE | [/api/admin/properties/[propertyId]](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/admin/properties/[propertyId]/route.ts) | Available |
| GET | [/api/admin/properties](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/admin/properties/route.ts) | Available |
| POST | [/api/admin/reviews/[reviewId]/moderate](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/admin/reviews/[reviewId]/moderate/route.ts) | Available |
| GET | [/api/admin/reviews](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/admin/reviews/route.ts) | Available |
| PATCH | [/api/admin/users/[userId]](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/admin/users/[userId]/route.ts) | Available |
| GET | [/api/admin/users](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/admin/users/route.ts) | Available |
| GET, POST | [/api/admin/workers](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/admin/workers/route.ts) | Available |

### auth

| Methods | Route/source | Mobile usage |
| --- | --- | --- |
| POST | [/api/auth/logout](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/auth/logout/route.ts) | App connected |
| GET | [/api/auth/me](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/auth/me/route.ts) | App connected |
| POST | [/api/auth/send-otp](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/auth/send-otp/route.ts) | App connected |
| POST | [/api/auth/session](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/auth/session/route.ts) | App connected |
| POST | [/api/auth/verify-otp](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/auth/verify-otp/route.ts) | App connected |

### bookings

| Methods | Route/source | Mobile usage |
| --- | --- | --- |
| POST | [/api/bookings/[bookingId]/cancel](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/bookings/[bookingId]/cancel/route.ts) | App connected |
| POST | [/api/bookings/[bookingId]/payment-session](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/bookings/[bookingId]/payment-session/route.ts) | App connected |
| GET, POST, PATCH | [/api/bookings/[bookingId]/pre-checkin](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/bookings/[bookingId]/pre-checkin/route.ts) | Available |
| GET | [/api/bookings/[bookingId]](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/bookings/[bookingId]/route.ts) | Available |
| POST | [/api/bookings/[bookingId]/stay-quote-payment](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/bookings/[bookingId]/stay-quote-payment/route.ts) | Available |
| POST, PATCH | [/api/bookings/[bookingId]/stay-requests](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/bookings/[bookingId]/stay-requests/route.ts) | Available |
| POST | [/api/bookings/[bookingId]/verify-payment](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/bookings/[bookingId]/verify-payment/route.ts) | App connected |
| GET | [/api/bookings/mine](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/bookings/mine/route.ts) | App connected |
| POST | [/api/bookings/personalization](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/bookings/personalization/route.ts) | Available |
| POST | [/api/bookings/quote](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/bookings/quote/route.ts) | App connected |
| POST | [/api/bookings](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/bookings/route.ts) | App connected |

### health

| Methods | Route/source | Mobile usage |
| --- | --- | --- |
| GET | [/api/health/ready](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/health/ready/route.ts) | Backend only |

### home

| Methods | Route/source | Mobile usage |
| --- | --- | --- |
| GET | [/api/home](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/home/route.ts) | App connected |

### internal

| Methods | Route/source | Mobile usage |
| --- | --- | --- |
| POST | [/api/internal/bookings/expire](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/internal/bookings/expire/route.ts) | Backend only |
| POST | [/api/internal/bookings/tasks](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/internal/bookings/tasks/route.ts) | Backend only |

### notifications

| Methods | Route/source | Mobile usage |
| --- | --- | --- |
| GET, POST | [/api/notifications](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/notifications/route.ts) | Available |

### partner

| Methods | Route/source | Mobile usage |
| --- | --- | --- |
| POST, PATCH | [/api/partner/bookings/[bookingId]/amendment](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/bookings/[bookingId]/amendment/route.ts) | Available |
| POST | [/api/partner/bookings/[bookingId]/customizations](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/bookings/[bookingId]/customizations/route.ts) | Available |
| GET, POST | [/api/partner/bookings/[bookingId]/operations](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/bookings/[bookingId]/operations/route.ts) | Available |
| GET | [/api/partner/bookings/[bookingId]](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/bookings/[bookingId]/route.ts) | Available |
| POST | [/api/partner/bookings/[bookingId]/status](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/bookings/[bookingId]/status/route.ts) | Available |
| POST, GET | [/api/partner/bookings/[bookingId]/stay-requests](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/bookings/[bookingId]/stay-requests/route.ts) | Available |
| GET | [/api/partner/bookings/export](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/bookings/export/route.ts) | Available |
| GET, POST | [/api/partner/bookings](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/bookings/route.ts) | Available |
| GET | [/api/partner/bookings/search](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/bookings/search/route.ts) | Available |
| GET | [/api/partner/dashboard/overview](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/dashboard/overview/route.ts) | Available |
| GET | [/api/partner/dashboard](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/dashboard/route.ts) | Available |
| POST | [/api/partner/onboarding](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/onboarding/route.ts) | Available |
| GET, POST | [/api/partner/physical-units](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/physical-units/route.ts) | Available |
| DELETE | [/api/partner/properties/[propertyId]/cancellation-policies/[policyId]](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/properties/[propertyId]/cancellation-policies/[policyId]/route.ts) | Available |
| POST | [/api/partner/properties/[propertyId]/cancellation-policies](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/properties/[propertyId]/cancellation-policies/route.ts) | Available |
| DELETE | [/api/partner/properties/[propertyId]/inventory-blocks/[blockId]](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/properties/[propertyId]/inventory-blocks/[blockId]/route.ts) | Available |
| POST, GET, PATCH | [/api/partner/properties/[propertyId]/inventory-blocks](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/properties/[propertyId]/inventory-blocks/route.ts) | Available |
| DELETE | [/api/partner/properties/[propertyId]/kyc/[documentId]](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/properties/[propertyId]/kyc/[documentId]/route.ts) | Available |
| POST | [/api/partner/properties/[propertyId]/kyc/finalize](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/properties/[propertyId]/kyc/finalize/route.ts) | Available |
| POST | [/api/partner/properties/[propertyId]/kyc/upload-url](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/properties/[propertyId]/kyc/upload-url/route.ts) | Available |
| PATCH, DELETE | [/api/partner/properties/[propertyId]/media/[mediaId]](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/properties/[propertyId]/media/[mediaId]/route.ts) | Available |
| POST | [/api/partner/properties/[propertyId]/media/finalize](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/properties/[propertyId]/media/finalize/route.ts) | Available |
| GET | [/api/partner/properties/[propertyId]/media/preview-urls](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/properties/[propertyId]/media/preview-urls/route.ts) | Available |
| POST | [/api/partner/properties/[propertyId]/media/upload-url](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/properties/[propertyId]/media/upload-url/route.ts) | Available |
| PATCH, DELETE | [/api/partner/properties/[propertyId]/rate-plans/[ratePlanId]](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/properties/[propertyId]/rate-plans/[ratePlanId]/route.ts) | Available |
| POST | [/api/partner/properties/[propertyId]/rate-plans](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/properties/[propertyId]/rate-plans/route.ts) | Available |
| PATCH, DELETE | [/api/partner/properties/[propertyId]/room-types/[roomTypeId]](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/properties/[propertyId]/room-types/[roomTypeId]/route.ts) | Available |
| POST | [/api/partner/properties/[propertyId]/room-types](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/properties/[propertyId]/room-types/route.ts) | Available |
| GET, POST | [/api/partner/properties/[propertyId]/rooms-workspace](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/properties/[propertyId]/rooms-workspace/route.ts) | Available |
| GET, PATCH | [/api/partner/properties/[propertyId]](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/properties/[propertyId]/route.ts) | Available |
| GET, POST | [/api/partner/properties/[propertyId]/stay-customizations](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/properties/[propertyId]/stay-customizations/route.ts) | Available |
| POST | [/api/partner/properties/[propertyId]/stay-image](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/properties/[propertyId]/stay-image/route.ts) | Available |
| GET | [/api/partner/properties/[propertyId]/stay-requests](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/properties/[propertyId]/stay-requests/route.ts) | Available |
| POST | [/api/partner/properties/[propertyId]/steps](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/properties/[propertyId]/steps/route.ts) | Available |
| POST | [/api/partner/properties/[propertyId]/submit](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/properties/[propertyId]/submit/route.ts) | Available |
| PUT | [/api/partner/reviews/[reviewId]/reply](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/reviews/[reviewId]/reply/route.ts) | Available |
| GET | [/api/partner/reviews](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/partner/reviews/route.ts) | Available |

### privacy-requests

| Methods | Route/source | Mobile usage |
| --- | --- | --- |
| POST | [/api/privacy-requests](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/privacy-requests/route.ts) | Available |

### properties

| Methods | Route/source | Mobile usage |
| --- | --- | --- |
| GET | [/api/properties/[slug]/bookable](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/properties/[slug]/bookable/route.ts) | App connected |
| GET | [/api/properties/[slug]/reviews](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/properties/[slug]/reviews/route.ts) | App connected |
| GET | [/api/properties/[slug]](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/properties/[slug]/route.ts) | App connected |

### reviews

| Methods | Route/source | Mobile usage |
| --- | --- | --- |
| POST | [/api/reviews/[propertyId]/photos/finalize](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/reviews/[propertyId]/photos/finalize/route.ts) | Available |
| POST | [/api/reviews/[propertyId]/photos/upload-url](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/reviews/[propertyId]/photos/upload-url/route.ts) | Available |
| GET, POST, PATCH | [/api/reviews/[propertyId]](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/reviews/[propertyId]/route.ts) | Available |

### search

| Methods | Route/source | Mobile usage |
| --- | --- | --- |
| GET | [/api/search/properties](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/search/properties/route.ts) | App connected |
| GET | [/api/search/suggestions](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/search/suggestions/route.ts) | App connected |

### stay-images

| Methods | Route/source | Mobile usage |
| --- | --- | --- |
| GET | [/api/stay-images/[propertyId]/[imageId]](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/stay-images/[propertyId]/[imageId]/route.ts) | Available |

### webhooks

| Methods | Route/source | Mobile usage |
| --- | --- | --- |
| POST | [/api/webhooks/razorpay](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/webhooks/razorpay/route.ts) | Backend only |

### wishlist

| Methods | Route/source | Mobile usage |
| --- | --- | --- |
| PUT, DELETE | [/api/wishlist/[propertyId]](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/wishlist/[propertyId]/route.ts) | Available |
| GET | [/api/wishlist](/Users/zrf/ABHI/Freelance/Helpkey/web/app/api/wishlist/route.ts) | Available |

## Access boundaries to preserve

| Route family | Access model |
| --- | --- |
| Home/search/public property/reviews list | Public DTOs; do not expose internal property, KYC or owner records. |
| Auth challenge/session | Public initiation with rate limits and provider verification; profile comes from verified Firebase identity. |
| Booking quote/personalization | Supports guest discovery; authenticated actor is optional. |
| Customer booking/detail/payment/cancel/pre-check-in/requests | Authenticated user plus booking ownership; financial writes use strict verification. |
| Wishlist/review writes/notifications | Caller identity; owner/eligibility checks in the relevant service. |
| Partner | Partner role and/or active property membership/ownership as required by the service; mutation flags/revisions also apply. |
| Admin | Active admin checks and route-specific controls; not customer functionality. |
| Internal booking maintenance | Server cron secret, never a credential to embed in mobile. |
| Razorpay webhook | Provider HMAC over raw request body, not Firebase or mobile auth. |
| Stay images | Delivery policy depends on public active offering versus authorized draft access. |

The mobile transport currently has GET/POST only. Existing server routes already require PUT, PATCH and DELETE for wishlist, reviews, arrival and other parity features. Add these methods to the shared transport without bypassing token refresh, timeout or error normalization.
