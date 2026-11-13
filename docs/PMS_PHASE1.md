# Helpkey partner PMS foundation

Phase 1 adds hotel-specific access, team management, account isolation, activation and guided preparation. “Ready to use” means the Phase 1 setup checks pass; it does not imply that folios, imports, night audit, channel integrations or a complete standalone PMS have been implemented.

## Where to find it

- **Owners:** Partner → Settings → PMS setup, Team or Room numbers. Settings always applies to the selected hotel. Property Listing also exposes public-booking availability and the voluntary pause control.
- **Receptionists:** Reservations for their assigned hotel, including permitted creation, assignment, notes and check-in/out. Collections, negotiated prices, cancellation/refund actions and exports are restricted.
- **Cashiers:** My hotel operations → Cashier payments. The restricted lookup shows matching bookings from the 50 most recently created reservations. Record collections or reverse unused erroneous property receipts; refunds require owner/manager access in the existing reservation workflow.
- **Housekeepers:** My hotel operations → Housekeeping. Update existing cleaning statuses without loading guest contacts, rates or payment data. This is not a new staff task-assignment system.
- **Maintenance:** My hotel operations → Room maintenance. Existing maintenance blocks reserve both physical room time and shared capacity. Overlapping reservations cannot be overwritten.
- **Managers:** Assigned hotel reservations, room/rate configuration, existing reporting and permitted financial operations. Team/activation administration and private listing/KYC controls remain owner-only.
- **Platform admins:** Admin → property details → Hotel PMS controls. Disable or remove the PMS restriction with a reason. This does not approve a public listing or complete missing setup.

## Invitations and access

An owner enters a staff email and role, then privately shares the generated seven-day link. The token is in the URL fragment and is stored only as a hash on the server. Creating another link for that email replaces the previous pending link. No email is sent automatically.

The recipient signs in with the matching Firebase-verified email, previews the hotel/role and explicitly accepts. Existing Google sign-in supports this. A phone-only or different-email account cannot accept. Acceptance preserves other application roles and grants only the invited hotel membership. Primary ownership cannot be transferred through this UI.

Owners can cancel invitations, change active staff roles and revoke access. Expired/cancelled invitations can be replaced. The activity list records the actor, target and time for team, activation and marketplace changes. Invitation tokens are excluded from history and team responses.

Server property access is checked on each request; operational transactions also recheck applicable membership/permission. Revoked access does not wait for the session cache. Visible clients check access every 15 seconds and on focus/navigation. Account transitions clear queries, pending work, local component drafts and private navigation state; logout performs a clean navigation. Browser tabs receive account-transition signals without private data. Retained hotel notifications do not grant retained access.

There are fixed presets for owner, manager, receptionist, cashier, housekeeper and maintenance. Arbitrary permission arrays supplied by a client or stored on a non-owner membership do not expand a preset. Custom permission editing and owner transfer are not included.

## Activation and checklist

Owners activate each hotel independently. Admins retain independent disable controls. Effective states are Not activated, Setup in progress, Ready to use and Temporarily disabled.

Completion is derived from saved data:

1. Hotel name, address/contact and valid IANA timezone.
2. Active room types with positive integer sellable capacity.
3. Unique active physical room numbers matching every active room type’s capacity.
4. Eligible rates and active cancellation policies for supported booking modes, plus valid check-in/out and cleaning settings.
5. Owner review of the team, including an explicit option to operate alone.
6. Owner declaration that no external reservations or balances need bringing across.
7. Interval inventory with reconciled holds, booking allocations, calendar counters and maintenance blocks.
8. Deployment features required for the existing operational tools are enabled.

Unknown opening information is incomplete. Declaring external opening reservations/balances keeps setup incomplete because imports/reconciliation are not implemented. There is no admin “mark ready anyway” button. Existing Helpkey reservations stay in the same inventory and payment records.

Readiness regresses when required saved data becomes incomplete. Readiness checks are bounded at 2,000 documents per inspected collection; an oversized or inconsistent hotel gets an explicit reconciliation blocker. This implementation has not been load-tested for large historical datasets. No counters, old reservations or legacy inventory engines are repaired automatically.

Use the existing controlled inventory-cutover and reconciliation commands for legacy hotels. Registering a room number never increments sellable capacity. Existing constraints protect duplicate labels, capacity limits and units with active assignments/maintenance.

## Public bookings versus PMS

The voluntary owner sales pause is separate from the existing administrative listing lifecycle. A ready hotel can continue authorized internal operations while its owner pauses public bookings. Internal creation and supported amendments retain current pricing/time rules and transactional shared inventory; this phase does not fix evening walk-ins or add stay changes.

Public customer quotes/creation continue to require a publicly eligible hotel. Admin listing pause, suspension, archive, revoked/rejected approval and restricted owner accounts cannot be bypassed through PMS. PMS disable does not rewrite customer payment attempts or stop provider reconciliation/refund recovery.

Existing owner marketplace access is retained before PMS activation. Once activated, incomplete or disabled PMS cannot fall back to the old operational workflow. Owners retain setup and team recovery controls while their account is eligible.

The existing manual-booking operator UID is not migrated into a new guest identity. Such records no longer confer customer-side booking ownership or guest notifications merely because the operator UID matches; authorized partner access remains available. Guest claiming/CRM is deferred.

## Deployment requirements

No production data migration, index deployment or hosting deployment is performed by this work. Apply the additive indexes in `firestore.indexes.json` and wait for readiness before using new cloud query shapes. New invitation and PMS-event documents are server-only under the existing default-deny rules.

To make the existing operational tools available in production, configure the existing deployment switches:

```text
PARTNER_RESERVATIONS_ALLOCATION=true
PARTNER_RESERVATIONS_PAYMENTS=true
PARTNER_ROOMS_CALENDAR=true
PARTNER_ROOMS_HOUSEKEEPING=true
```

`PARTNER_RESERVATIONS_AMENDMENTS` retains its independent behavior. Global switches remain emergency controls; hotel-level activation does not override them. Rebuild/restart booking workers alongside web because notification authorization changed. Configure Firebase Google sign-in if verified-email invitation acceptance is needed. No invitation-email provider is required.

## Reproducible checks

The new browser suite runs actual Next.js routes against explicit localhost Firebase Auth and Firestore emulators. It refuses absent/remote emulator addresses, uses the `demo-helpkey-pms` project, creates disposable accounts/hotels and removes its fixture records. It never uses existing hotel accounts for testing. The isolated Next server uses port 3014 and `.next-pms`, with provider credentials and Redis connections disabled.

```sh
npm test
npm run typecheck -- --incremental false
npm run lint
npm run build -- --webpack
npm run build:workers

FIRESTORE_EMULATOR_HOST=127.0.0.1:8187 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9097 \
FIREBASE_ADMIN_PROJECT_ID=demo-helpkey-pms \
npx vitest run tests/pms-foundation.emulator.test.ts

FIRESTORE_EMULATOR_HOST=127.0.0.1:8187 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9097 \
FIREBASE_ADMIN_PROJECT_ID=demo-helpkey-pms \
npx playwright test --config playwright.pms.config.ts

npm run test:e2e:partner
```

Existing emulator suites use their own demo project and, in one suite, a required dedicated port. Provider calls in transaction regressions remain mocked. A green emulator/browser run is not proof of live provider delivery, deployed index availability or production load behavior.

## Verification results

Verified locally on 13 November 2026:

- Unit suite: 538 passed; 108 environment-dependent tests skipped in this run.
- Isolated emulator regression suites: 85 passed across PMS foundation, reservations, rooms, booking transactions, stay customizations, stay workspace and partner dashboard.
- Real Next.js/Firebase emulator browser suite: 11 passed, covering independent activation/public pause, invitation preview/acceptance/history, receptionist permissions, mobile housekeeping, maintenance blocks against shared inventory, open-page revocation, account switching/browser history, admin restrictions, cashier collections, multiple assigned hotels and cross-tab logout.
- Existing responsive partner browser suite: 60 passed.
- Production web build, worker bundles and TypeScript checks passed. ESLint has no errors; existing repository warnings remain.

Test fixtures use disposable emulator accounts and hotels. No live hotel records, payment providers, cloud indexes or deployment settings were changed. Live provider delivery, production load, and the separate dedicated-port guest-details emulator suite were not verified by this work.
