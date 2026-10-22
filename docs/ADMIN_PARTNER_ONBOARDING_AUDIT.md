# Admin and partner onboarding audit

Reviewed: 20 October 2026. Scope: current working tree, including existing uncommitted changes, both supplied screenshots, admin pages and routes, partner onboarding and listing editors, persistence, moderation, publication, and relevant database specification. This is a source review with one focused test run; it is not a live production data or end-to-end audit. No application code was changed.

## Main conclusion

The admin currently has a listing moderation interface, but does not have a complete partner onboarding dossier. Much of the information already exists in Firestore and the admin detail API, yet is not rendered. Other information, especially business identity, ownership, and payout details, is not collected by the current onboarding interface. Displaying more fields alone will not solve those collection gaps.

Treat these as three separate problems:

1. Collected and stored, but hidden from admin.
2. Supported by a schema or specification, but not collected by the current UI.
3. Displayed as verified or complete without evidence from the actual verification records.

## What the screenshots show

- Screenshot 1 shows the top of a scrollable property workspace: moderation actions and review timeline. Listing details, room/rate/policy summaries, photos, and KYC cards exist below this area in the component. Their absence from this screenshot does not mean those sections are missing entirely.
- The disabled approval action is expected when required assets are unapproved. However, the displayed “6 photos” rule is incomplete compared with the server rule.
- “Delete” is the property name rendered in the header and queue, not an unexpected deletion prompt.
- Screenshot 2 combines real aggregate metrics with a static growth chart and misleading metric labels. History and Export are disabled. The header clock and “Live Production” label are hardcoded.

## Current architecture and flow

Primary sources:

- `components/partner/partner-onboarding.tsx`: create/resume a listing.
- `components/partner/property-setup.tsx`: eight setup stages.
- `lib/partner/service.ts`: schemas, ownership, draft creation, submission.
- `components/admin/dashboard/admin-partners-page.tsx`: partner directory and inferred verification dossier.
- `components/admin/dashboard/admin-properties-page.tsx`: property queue and inferred readiness.
- `components/admin/dashboard/admin-property-review-drawer.tsx`: shared property review workspace.
- `lib/admin/data.ts`: admin detail aggregation and overview metrics.
- `app/api/admin/properties/[propertyId]/...`: edit, review, asset moderation, lifecycle, previews, deletion.

The visible onboarding UI calls `/api/partner/onboarding` with `startDraft: true`, name, property type, city, and country. It creates a property, owner membership, partner role, and a minimal partner profile. It does **not** collect the fuller business profile supported by the alternative `beginOnboarding` API branch.

The stages are property type → location → details → rooms/rates/cancellation → facilities/guest policies → photos → verification → review/submission.

Storage is distributed across `users`, `partnerProfiles`, `propertyMemberships`, `properties`, `roomTypes`, `ratePlans`, `cancellationPolicies`, `mediaAssets`, `verificationDocuments`, and `propertyReviewEvents`. Private originals use object storage; approved photo publication runs asynchronously through publication jobs/outbox. Search projections also run asynchronously.

Submission moves a listing to `pending_review/pending`. Approval moves it to `active/approved` and sets `isBookable: true`. Request changes and rejection move it to `draft` with `changes_requested` or `rejected`, retain a reason, and disable booking. Submission attempts and listing decisions are recorded transactionally. Decision/submission notifications are best-effort in-app notifications; this service does not deliver email/SMS/WhatsApp.

## Field-by-field visibility inventory

“API available” below means the admin property detail response contains the data when it exists. It does not guarantee a field has been filled in.

| Area | Details collected or supported | What admin currently sees | Gap |
| --- | --- | --- | --- |
| Account | UID, full name, email, phone, roles, account status, login/creation timestamps | Directory identity/contact summary, account actions | Property workspace does not join and display the full owner account alongside business identity |
| Business profile | Alternative API supports business name/email/phone/address; profile schema includes PAN, GSTIN, KYC, payout eligibility, default commission | `detail.partner` is returned but not rendered | Current start-draft UI does not collect business identity; showing the profile may reveal missing fields rather than recover data |
| Property basics | Name, type, description, floors, total physical rooms, public phone/email, check-in/out | Eight editable values: name, description, phone, email, floors, total rooms, check-in, check-out | Type and other stored settings are absent from the full workspace |
| Address | Line 1, line 2, landmark, city, district, state, postal code, country | City/state in list screens | No full address in property workspace. Current setup save explicitly clears line 2, landmark, and district to null |
| Map | Latitude/longitude, Google place ID, timezone, geohash | No map/location evidence in full workspace | Raw property includes geoPoint; normalize it into explicit coordinates for the admin DTO and show map/place/timezone |
| Facilities | Property amenity IDs, room amenity IDs | Not displayed in property workspace | Existing property amenities are hidden; room-level data may be configured later |
| Guest policies | Children allowed, pets allowed, smoking allowed, government ID required | Not displayed in property workspace | Partner-provided policy choices are hidden |
| Booking setup | Overnight/hourly modes, cleaning buffer, inventory engine | Not displayed in property workspace | Admin cannot inspect operating assumptions for hourly stays |
| Room types | Name, description, inventory, adults/children/infants, beds; later edits support size, bathroom type, amenities, photos, cover, modes, buffer, status | Room name and room count | Occupancy, beds, facilities, status, photos, and hourly settings are hidden |
| Room creation defaults | Current setup explicitly supplies zero children, zero infants, one double bed; creation sets size null and private bathroom | Not identified as defaults | Do not present these defaults as details explicitly confirmed by the partner |
| Rate plans | Name/code, linked room/policy, price, mode/model, duration, hourly price, windows, midnight option, payment mode, taxes, fees, deposit, stay rules, status | Rate name and base price | No room/policy relationship, price unit, package duration, timing, tax/fee/deposit breakdown, or limits |
| Cancellation | Name, description, free-cancellation cutoff in hours, cancellation fee percent | Policy name | Admin cannot read the actual cancellation terms from the workspace |
| Photos | File, category, room assignment, cover linkage, alternative text, moderation/publication state, rejection reason, timestamps | Thumbnail, filename, category, moderation/publication status, approve/reject | No room assignment or cover badge; alt text, reasons, size, dates, reviewer and publication failure details are hidden |
| Photo DTO | Storage contains `roomTypeId`; room records contain gallery IDs | Admin media DTO omits `roomTypeId` | This is an API omission as well as a display omission; include room associations explicitly |
| KYC uploads | Required PAN, government ID front/back; optional GST; JPEG/PNG/PDF, max 10 MB | Preview/link, filename/type, status, approve/reject | No extracted identity values or comparison against account/business details; no full review metadata display |
| KYC metadata | Size, status, review reason, timestamps are returned; storage records latest reviewedBy/reviewedAt | Mostly hidden | DTO omits reviewer identity/review time; no version history of replaced documents |
| Ownership | No property-registration/ownership upload type in current KYC endpoint | Partner dossier labels “Ownership proof” verified via inferred progress | There is no corresponding verified ownership document supporting this label |
| Payouts | Specification defines bank proof, eligibility, manual payouts; profile has related fields | No operational payout workspace | Bank beneficiary/account/IFSC/proof and payout onboarding are not collected by current setup |
| Audit | Property stores creator/updater and dates; events contain actor ID/role, before/after states, reason, attempt | Event action, role, reason, attempt and timestamp | No actor name/ID display, submitted snapshot, changed fields, or complete edit history |
| Other stored settings | OTA URLs, language, currency, commission/fee rules and support contact, depending on creation path | Mostly hidden | Distinguish meaningful configured values from placeholders/defaults; current setup has no OTA-link collection step |

The admin detail API loads the full property, partner profile, room, rate, and cancellation records. Most visibility improvements can reuse that data. Photos/documents use intentionally narrower DTOs and need selected metadata added. Private object keys and signed links should not become permanent public fields.

## Confirmed defects and implementation gaps

### Urgent: broken correction flow and misleading verification

**1. A partner cannot replace rejected KYC after a changes request.**

`app/api/partner/properties/[propertyId]/kyc/finalize/route.ts` and `kyc/[documentId]/route.ts` only allow changes when status is `draft` **and approval is `not_submitted`**. Admin changes/rejection creates `draft/changes_requested` or `draft/rejected`. Those states cannot finalize replacements or delete old documents. Upload authorization does not enforce the same restriction, so an upload may succeed before finalization fails. Use one shared state policy that permits corrections and preserves review history.

**2. “Verified” KYC indicators are inferred, not evidence-based.**

`admin-partners-page.tsx` assigns progress 3 for ordinary drafts, 4 for pending listings, 5 for live listings, and 2 for suspended users. Government ID, PAN, ownership proof, and photos are then marked Verified using progress thresholds. A draft with no documents can show three verified items. Risk is similarly inferred from suspension/changes status, not an identity or fraud assessment. Replace these with actual per-document/per-property results; missing evidence must remain missing or unverified.

**3. Permanent deletion destroys bookings/payments and leaves other dependencies unresolved.**

`app/api/admin/properties/[propertyId]/route.ts` explicitly hard-deletes matching `bookings`, `payments`, and review events. This contradicts the repository database specification’s preservation rule. Its deletion list does not cover the newer booking/payment-attempt/refund/inventory/publication/projection records, and deleting parent documents does not recursively delete Firestore subcollections. It also does not enqueue search removal or invalidate public caches. Recommend archive/soft deletion for properties with transaction history and an explicit retention-aware cleanup process for disposable drafts.

The storage-first deletion is also not atomic: some object deletions can succeed before another fails, and database batch deletion can fail after earlier batches commit. The code comment promising a safe complete retry overstates that behavior.

### High priority: review integrity and completeness

**4. The client approval checklist disagrees with the server.**

The drawer checks six approved property images and three approved document types. The server uses `photoRequirements`: at least `max(6, 1 + 2 × active room types)` approved photos, exterior photo, bedroom and bathroom photo per active room type, and a valid approved cover. Three room types require at least seven photos. Use the shared rule and show every unmet requirement; the server correctly remains authoritative.

**5. Admin lists silently stop at the first page.**

Properties/users APIs default to 25 records and return `hasMore/nextCursor`. `use-admin-data.ts` ignores pagination. Partners are derived by joining those two incomplete pages, and filters/search run locally. Consequently partners/properties can disappear, portfolios/counts can be wrong, and records beyond the first page cannot be found through these screens. Use paginated server filters and a dedicated partner dossier query rather than joining unrelated first pages.

**6. Sensitive live edits do not trigger another review.**

The partner property PATCH route permits changing property type, address/map, description and policies without resetting approval or creating a reviewed revision. It does have useful location completeness, media-ownership and timezone-cutover checks, but these are not review enforcement. The database specification says approved core identity/location/type changes require admin review. Define which fields require a revision and preserve the currently approved version until the revision is decided.

**7. Partner profile state is not synchronized with document/listing decisions.**

Submission writes profile `onboardingStatus: submitted`. The reviewed admin decision and document moderation routes do not update profile onboarding/KYC/payout status. The current start-draft path does not initialize all those fields either. Multiple properties further require a deliberate account-versus-property aggregation rule. Do not derive payout eligibility from one property’s listing status.

**8. Admin property edits skip important downstream behavior.**

Admin PATCH writes the property but does not enqueue a search projection, invalidate public caches, or write a field-change audit event. It also lacks the partner route’s complete-location/media ownership and timezone-cutover checks. Share domain validation and mutation behavior between admin/partner routes, with explicit role-specific privileges.

**9. Lifecycle actions accept invalid transitions.**

The lifecycle endpoint does not validate the source state. Calling `resume` directly sets active/bookable regardless of approval, and `pause/archive` can be applied from unexpected states. Public catalog code also checks approval, so this is an inconsistent state risk, not proof that an unapproved hotel automatically becomes public. Enforce allowed transitions and approval prerequisites on the server.

**10. Approval does not repeat all submission checks.**

Approval transaction rechecks photos and KYC, but not the whole property/room/rate/policy readiness assessment. Submission validates most readiness outside its final transaction; edits can occur while pending. Re-evaluate a shared readiness result at approval and use a submission revision/version to ensure the admin is deciding the data actually reviewed.

### Medium priority: reliable admin operation

**11. Dashboard content overstates what it measures.**

- “Pending Partners” uses total partner accounts (`metric.partners`).
- “Total Properties” uses the loaded property page length.
- Its pending detail uses the urgent queue length, capped at six.
- Growth chart uses fixed SVG paths, not listing history.
- Support issue rows are hardcoded examples.
- Clock, environment label and admin identity are hardcoded; the notification bell itself is a real component.
- Property readiness is an arbitrary score from name/city/submission/status, not a field audit.

**12. The review workspace obscures failures and review context.**

An initial detail failure stores an error but continues returning the loading-only view, hiding the error. Preview and event failures are swallowed. Signed previews expire after 15 minutes without a refresh schedule. Images have thumbnails but no full-size viewer action; PDFs open through links. One shared reason textarea supplies all document/photo/listing rejections, increasing the chance of unrelated notes. Asset buttons do not consume the parent mutation busy state. Add explicit errors/retry, on-demand preview refresh, full-size evidence viewing, per-item notes and consistent pending controls.

**13. Audit history is partial.**

Property state transitions have events; ordinary field edits and asset decisions do not append events to that timeline. Asset records retain only their latest reviewer fields. KYC replacement deletes the preceding document record and object. Event API returns at most 50 events with no UI pagination. Preserve revision/decision history and show reviewer identity plus before/after field changes.

**14. Frontend readiness differs from server validation.**

The KYC step and final review count document types even when rejected; submit correctly excludes rejected documents. Step completion endpoint validates photo readiness specially but otherwise permits marking arbitrary stages complete. Facilities readiness checks for an amenity, not completed guest-policy fields. A saved-step checkbox should not imply verified readiness.

**15. Additional consistency issues.**

- Onboarding list calls approved properties “Live” without considering paused/archived lifecycle state.
- The draft predicate captures changes-requested/rejected drafts before their more specific status branches, so their intended feedback labels are bypassed.
- Later facilities editing forces `governmentIdRequired: true`, potentially overwriting the choice made during setup.
- Creating another draft overwrites partner profile creation timestamps in `startPropertyDraft`.
- The alternative `beginOnboarding` branch merges a large initial record into an existing primary draft, resetting many values, and has no existing-listing-state guard. It should be restricted to initialization or made explicitly idempotent.
- Suspending an account updates the user/session, but this route does not pause its properties. Decide and implement whether account suspension should also remove listings from sale; current public catalog predicates primarily inspect property state.

## Recommended admin workspace

Keep the directory as a queue, and use a dedicated property review page for the complete record. A small drawer can remain a quick preview.

| Section | Required contents |
| --- | --- |
| Overview | Property/partner IDs, owner, exact lifecycle and approval state, submission attempt, first/latest submission dates, readiness blockers |
| Partner/business | Account details, business identity/contact/address, legal/tax identifiers where collected, missing profile fields, other properties |
| Location | Full address, map, coordinates, Google place ID/link, timezone, location change history |
| Property | Type, full description, floors, physical capacity, public contacts, check-in/out, booking modes |
| Rooms | Expand every room with full occupancy, beds, size, bathroom, amenities, inventory, photo associations, status and cleaning buffer |
| Pricing | Group plans under their room, label nightly/hourly/package units, show duration/windows/limits, cancellation linkage, taxes/fees/deposit/payment terms |
| Policies | Full cancellation terms plus child/pet/smoking/guest-ID choices, with explicit missing/unset values |
| Photos | Category and room filters, cover marker, full-size viewer, individual reasons/reviews, upload dates and publication errors/retry |
| Verification | Required/optional document checklist, secure evidence viewer, actual document status, reviewer/time, reason, versions; ownership proof only if genuinely collected |
| Commercial/payout | Commission and payout settings where implemented; display “Not collected” or “Not configured” accurately |
| History | Field changes, document/photo decisions, submission snapshots, named actors, timestamps, reasons and resubmission differences |

Use four distinct field states: supplied, missing, system default, and admin amended. A missing value is not equivalent to “No,” zero, or verified. For every admin amendment record old value, new value, actor, time, reason and revision. Separate internal notes from partner-visible feedback.

Keep approval controls visible alongside real blockers. Keep destructive actions in a separate management area. Approval should mean all required evidence and business checks passed for the exact submitted revision.

## Suggested implementation order

1. Repair KYC correction states, remove unsupported Verified claims, and address destructive deletion behavior.
2. Correct pagination/counts and implement one shared readiness assessment for partner/admin.
3. Expand the admin DTO and render all already-collected fields, including room/photo/policy relationships.
4. Add business/ownership/payout collection only after deciding the actual required product fields. Label unsupported fields honestly until implemented.
5. Add revision-based review, field/asset audit history, valid lifecycle transitions, and consistent cache/projection updates.
6. Replace static dashboard content and improve preview/error handling.

## Other admin areas

- Bookings: working list/search/status/mode filters, pagination, cancellation, booking timeline, payment/refund inspection and reconciliation retry. This has its own operational data model; it does not complete the partner dossier.
- Users: account status/role management; self-removal and final-active-admin protections exist. Uses the same incomplete first-page directory hook.
- Privacy requests: latest 100 requests, read-only inbox; explicitly does not perform deletion or provide a complete resolution workflow.
- Reviews: informational page explaining automatic publication; no admin review-management queue.
- Aadhaar Lab: separate OTP verification/testing workspace with environment/consent controls. It is not connected to partner onboarding evidence as implemented here.
- Payments, Support, Settings: disabled navigation entries. History and Export on the overview are disabled too.

## What is already sound

Admin routes require authenticated active admin access. Partner mutations check owner membership. Listing state decisions and their review events commit together. Server approval checks actual approved evidence rather than trusting the button. KYC originals are private, signed preview responses are no-store, and uploads verify checksum/content. Photo publication has an asynchronous state model. These are useful foundations to preserve.

## Validation and limits

Ran `npm test -- tests/photo-requirements.test.ts`: **2 passed, 3 failed**. All three reported failures are expected-label mismatches (`Double: bedroom photo` versus `Double · Bedroom photo`, and equivalent bathroom labels). This does not establish that the category-counting logic is broken; it does establish that the current focused suite is not green.

The repository has broader booking/auth tests, but no dedicated admin onboarding end-to-end test among the inspected test files. The important follow-up scenarios are document rejection → replacement → resubmission; three-room photo approval; more than 25 users/properties; sensitive edits while pending/live; invalid lifecycle actions; preservation of historical bookings/payments on archive/deletion; and visible recoverable API/preview failures.

No live Firebase records, object storage, provider calls or authenticated browser interactions were performed. The report distinguishes implemented code from database-specification intentions. Existing unrelated working-tree changes were preserved.
