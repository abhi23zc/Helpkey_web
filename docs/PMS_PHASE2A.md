# Phase 2A: walk-ins, hotel time and guest identity

## Reception workflow

Open **Partner → Reservations → New reservation** (the existing Overview entry also opens the same form).

- **Future reservation / telephone** uses the agreed reservation dates and standard hotel check-in/out times. Saving creates a confirmed reservation, never automatic check-in.
- **Guest arriving now — walk-in** uses today's date in the selected hotel's IANA timezone and an explicitly recorded arrival time. Enter the actual time, review the occupancy/departure and total, then save. Open the saved reservation and explicitly use **Check in**. Check-in records the guest's recorded arrival separately from when staff registered the check-in.
- Public customer quotes retain their existing advance-notice and past-time restrictions. Internal walk-ins have a separate authorized evaluation context; rate eligibility, stop-sell, shared capacity, cleaning buffers, operational restrictions and transactional inventory remain authoritative.

At 8 PM, a walk-in is not rejected merely because standard check-in was 2 PM. Actual occupancy starts at the recorded arrival. An hourly stay keeps its exact recorded minute; shared inventory conservatively includes every overlapping quarter-hour interval and the cleaning buffer. Hourly duration prices, operating/arrival windows and permission to cross midnight still apply.

The Today shortcut, minimum dates, calendar highlight, previews and saved displays use the hotel timezone. A staff device's timezone does not determine hotel dates. Nonexistent/ambiguous local times during daylight-saving transitions fail explicitly rather than choosing an offset silently.

## After midnight and early arrivals

New overnight walk-ins never use the previous night automatically or through a previous-night option. A recorded walk-in must be on the server's current hotel date, at a time no later than now. Previous-date backfilling is unsupported.

Owners control **Settings → PMS setup → Confirm opening information → Allow overnight walk-ins before standard check-in**. The default is off. Saving this setting uses the existing setup/declaration permissions and inventory verification; it cannot bypass incomplete activation or administrative restrictions.

Example: at **1 AM on 14 November**, with early walk-ins enabled, reception can book **14 → 15 November**, departing at the standard checkout on the 15th. The UI explicitly shows this longer occupancy period. The complete published calendar-night price applies; no automatic early-arrival fee or previous-night price is invented. Inventory is occupied from 1 AM. With the setting off, overnight creation is blocked until standard check-in; an eligible hourly stay can be offered separately.

Existing reservations retain their agreed dates and occupancy windows. A guest arriving after midnight for an already agreed previous-date reservation records a distinct actual check-in timestamp; the booking is not silently redated. This feature does not extend or move an existing booking, or enable early check-in before its agreed start. Do not create a duplicate reservation to work around an existing stay's restrictions.

Saving from the current UI binds the reviewed start, departure, timezone and total. If these change, saving fails and reception must review the refreshed terms. Existing client contracts remain additive. New request bodies retain stable retry keys; replays return the same booking, and competing sales still share one allocation transaction.

## Guests, booking contact and account access

New staff-created reservations record:

- Creating staff in `createdByStaffId` and the existing actor/history fields.
- The lead staying guest and only the accompanying names actually entered.
- An independent booking contact when somebody books for another person.
- A versioned hotel-scoped guest profile and an initially unlinked customer identity.

The initial form accepts accompanying adult names, one per line. **Reservation details → Staying guests and registration** supports completing adult/child/infant names, with revision checks and immutable before/after events. Unknown occupants remain missing; the application does not repeat the lead name or invent people. Registration completion here concerns staying names only, not existing identity-document or pre-check-in requirements. Those existing requirements remain separate and are not expanded.

Profiles live under their hotel, are server-only and are not globally searchable. This phase creates a profile for the reservation; contact-based merging, a standalone CRM and cross-reservation profile reconciliation are deferred.

**Invite a customer account** creates a privately shared, seven-day invitation link. The recipient is explicitly selected; default to the lead guest or deliberately choose the separate booker. This person receives reservation access and guest updates. The token is in the fragment, is stored only as a hash, and is excluded from activity events. Issuing a replacement invalidates the previous link; pending invitations can be cancelled. No email is sent automatically.

The recipient signs into Helpkey with the matching Firebase-verified email, reviews the reservation and explicitly accepts. Wrong accounts, unverified emails, cancelled/expired links and conflicting links are rejected. The issuer's operational authority is rechecked at acceptance. Matching a phone/email in a form never grants access. There is no arbitrary account-ID assignment or automatic historical claiming.

After acceptance, the existing customer web and mobile APIs serve the linked reservation to that account. Invitation acceptance uses the website; a native invitation/deep-link screen is not added. The customer can refresh Bookings in the app after accepting. The staff creator's personal trips remain unchanged unless that account itself explicitly completes a legitimate verified linking process. Notifications resolve the verified linked customer and currently authorized hotel staff, never the operator merely because they recorded the booking.

## Historical manual records

Historical `manual_partner` bookings remain readable by authorized staff. Their original lead names, operator association, payments, inventory and history are preserved. They are not converted or linked automatically. The new registration editor and customer-link flow refuse records without the new identity version.

A read-only review command reports IDs and ambiguity flags without exposing names/contact details or changing documents:

```sh
npx tsx --env-file=.env.local scripts/preview-manual-identities.ts \
  --project PROJECT_ID --property PROPERTY_ID
```

Both identifiers are required. There is no `--apply` mode. Output identifies operator-as-customer associations, repeated adult names, missing names and review-required records; it does not assert that repeated names are necessarily wrong. Redirect the JSON lines to a private file for review if needed. A real correction process must be separately designed and authorized; no correction migration is shipped.

## Deployment and compatibility

Deploy the updated web application and rebuild/restart booking workers, because notification ownership checks changed. Ship the additive mobile display/model updates with the app when desired; existing clients retain API compatibility. Firebase verified-email sign-in must be available for invitation acceptance (existing Google sign-in is supported). No invitation-email provider is needed.

Phase 2A adds no composite indexes and performs no cloud deployment, IAM change, inventory cutover or live-data migration. Existing Phase 1 feature flags, hotel activation and marketplace/PMS separation remain in force. Enable early walk-ins individually only for hotels that choose that policy; no hotel setting is changed automatically.

No partial advance, room board, Today dashboard, folio, invoice, room move, extension, night audit or channel integration is included. Prices and payment records remain in the existing shared engine.

## Verification

Tests use disposable local Auth/Firestore emulator accounts and hotels, with real Next.js routes for browser verification. No live hotel reservations or records are created or changed.

Reproducible commands:

```sh
npm run typecheck -- --incremental false
npm run lint
npm run build -- --webpack
npm run build:workers
npm test

FIRESTORE_EMULATOR_HOST=127.0.0.1:8187 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9097 \
FIREBASE_ADMIN_PROJECT_ID=demo-helpkey-pms REDIS_DISABLED=1 \
npx vitest run --testTimeout 30000 tests/pms-walk-in.test.ts tests/pms-walk-in.emulator.test.ts

FIRESTORE_EMULATOR_HOST=127.0.0.1:8187 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9097 \
FIREBASE_ADMIN_PROJECT_ID=demo-helpkey-pms \
npx playwright test --config playwright.pms-walk-in.config.ts
```

The browser server refuses missing or remote emulator addresses and disables live payment-provider credentials. Browser verification uses desktop/mobile layouts, a hotel in Pacific/Kiritimati and a device in America/Los_Angeles, including different calendar dates. Financial regressions use existing mocked provider responses, not live provider delivery. Actual Google sign-in/provider delivery and installation on a physical mobile device are not verified by these tests.

### Local verification results (13 November 2026)

- Phase 2A domain and isolated transaction checks: 9 passed (4 domain/access cases, 5 transaction scenarios). These cover the 8 PM arrival, after-midnight policy, hourly midnight crossing, separate identities, concurrent same-key retries, final-room contention, future confirmed reservations, verified invitation rejection/acceptance, correct in-app notification recipients, registration revisions, historical preservation and departure changes without price changes.
- Existing booking/payment/inventory/room/stay/dashboard transaction regressions: 81 passed. Phase 1 isolated foundation regressions: 6 passed.
- Phase 1 real Next.js/Auth/Firestore browser suite: 13 passed. Existing responsive partner browser suite: 64 passed.
- Mobile unit suite: 766 passed; mobile TypeScript passed. These validate parsing and hotel-local presentation, not a physical-device end-to-end installation.
- Production webpack build (including TypeScript), worker bundles and whitespace checks passed. Full ESLint has no errors and 95 existing warnings.
- Full web unit run: 547 passed, 115 environment-dependent tests skipped, 2 failures in `tests/hotel-detail.test.ts`. Both are the existing cache contract expecting 30 seconds while the separately modified `lib/services/public-stay.ts` uses 300 seconds. That unfinished cache change was preserved; it is not part of Phase 2A.
- Historical preview command smoke-tested against an empty emulator hotel, reporting zero writes. No live historical review/correction or provider delivery was performed.
- Final Phase 2A real Next.js/Auth/Firestore browser run: 6 passed across desktop and 390px mobile layouts. It uses the assigned receptionist account for creation and verifies hotel-local Today across calendar-date differences, confirmed creation without automatic check-in, distinct occupants/booker, form preservation on creation errors, explicit verified invitation acceptance, invitation-fragment changes, customer versus staff personal-trip visibility, registration retry preservation and stale revision rejection with explicit reload. The mobile form and confirmation screenshots were visually inspected.

### Post-review corrections (13 November 2026)

- Guest registration and invitation edits participate in the reservation workspace's unsaved-change warning. Starting a save immediately guards closing; failed saves retain input. Explicit reload resets the form even when the saved revision has not changed.
- Guest saves refresh the reservation header, list/overview and operation history/revision. Guest metadata also refreshes after lifecycle actions and periodically without replacing unsaved names.
- Saved invitation status, recipient and expiry load when reopening. Reception can cancel a pending invitation without retaining or recovering its private token. The server response excludes invitation secrets.
- Hotel-detail snapshots again expire within 30 seconds (or sooner at an arrival/cancellation cutoff), restoring the tested freshness contract. The two cache failures reported above are resolved.

Post-fix verification: 549 web unit tests passed (115 environment-dependent tests skipped); 15 Phase 2A/foundation domain and emulator checks passed; 8 real desktop/mobile Phase 2A browser checks and 64 existing responsive partner checks passed. TypeScript and whitespace checks passed. Full ESLint has zero errors and the same 95 existing warnings; changed source/test files have zero lint findings. Tests used disposable local emulators; no live records or deployments were changed.
