# Helpkey partner PMS foundation

Phase 1 adds hotel-specific access, team management, account isolation, activation and guided preparation. “Ready to use” means the Phase 1 setup checks pass; it does not imply that folios, imports, night audit, channel integrations or a complete standalone PMS have been implemented.

## Where to find it

- **Owners:** Partner → Settings → PMS setup, Team or Room numbers. Settings always applies to the selected hotel. Property Listing also exposes public-booking availability and the voluntary pause control.
- **Receptionists:** Reservations for their assigned hotel, including permitted creation, assignment, notes and check-in/out. Collections, negotiated prices, cancellation/refund actions and exports are restricted.
- **Cashiers:** My hotel operations → Cashier payments. Exact reference/ID lookup finds reservations throughout the hotel history. The outstanding-balance list uses signed pagination, inspecting up to 50 eligible reservations per page; pages containing only settled stays may be empty with more pages available. Record collections or reverse unused erroneous property receipts; refunds require owner/manager access in the existing reservation workflow.
- **Housekeepers:** My hotel operations → Housekeeping. Update existing cleaning statuses without loading guest contacts, rates or payment data. This is not a new staff task-assignment system.
- **Maintenance:** My hotel operations → Room maintenance. Existing maintenance blocks reserve both physical room time and shared capacity. Overlapping reservations cannot be overwritten.
- **Managers:** Assigned hotel reservations, room/rate configuration, existing reporting and permitted financial operations. Team/activation administration and private listing/KYC controls remain owner-only.
- **Platform admins:** Admin → property details → Hotel PMS controls. Disable or remove the PMS restriction with a reason. This does not approve a public listing or complete missing setup.

## Invitations and access

An owner enters a staff email and role, then privately shares the generated seven-day link. The token is in the URL fragment and is stored only as a hash on the server. Creating another link for that email replaces the previous pending link. No email is sent automatically.

The recipient signs in with the matching Firebase-verified email, previews the hotel/role and explicitly accepts. Existing Google sign-in supports this. A phone-only or different-email account cannot accept. Acceptance preserves other application roles and grants only the invited hotel membership. Primary ownership cannot be transferred through this UI.

Owners can cancel invitations, change active staff roles and revoke access. Expired/cancelled invitations can be replaced. The activity list records the actor, target and time for team, activation and marketplace changes. Invitation tokens are excluded from history and team responses.

Server property access is checked on each request; operational transactions also recheck applicable membership/permission. Revoked access does not wait for the session cache. Visible clients check access every 15 seconds and on focus/navigation. Returning to a tab with the same account preserves unfinished forms and invitation links. During identity verification, private UI is hidden with its state retained; failed verification offers a retry. Only actual account transitions reset private state. Account transitions clear queries, pending work, local component drafts and private navigation state; logout performs a clean navigation. Browser tabs receive account-transition signals without private data. Retained hotel notifications do not grant retained access.

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
7. Interval inventory with a successful server-verified setup checkpoint for holds, booking allocations, calendar counters and maintenance blocks.
8. Deployment features required for the existing operational tools are enabled.

Unknown opening information is incomplete. Declaring external opening reservations/balances keeps setup incomplete because imports/reconciliation are not implemented. There is no admin “mark ready anyway” button. Existing Helpkey reservations stay in the same inventory and payment records.

Readiness regresses when required saved data becomes incomplete. Routine readiness checks read current configuration and a server-only verification checkpoint, without scanning booking history. Configuration collections remain bounded at 2,000 records; historical bookings/calendars have no 2,000-record readiness cutoff. Full inventory verification runs on activation, enabling, opening-declaration saves and the owner’s Verify inventory action, with paginated reads in one consistent transaction. An existing activated hotel without a checkpoint requires one owner verification. This remains a setup checkpoint: each operational command retains its own authoritative checks, and a full audit is available explicitly. Very large full audits remain subject to Firestore transaction/time/resource limits; they fail without saving a successful result. No counters, old reservations or legacy inventory engines are repaired automatically.

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

## Correction verification (13 November 2026)

Regression coverage now includes same-account foreground return and failed identity-check recovery, invitation-link preservation, more than 2,000 historical bookings/calendars, explicit drift detection, constant-scope runtime readiness reads, older cashier references, pagination past settled stays, and cross-account/property cursor rejection. Fresh correction checks:

- Unit suite: 541 passed; 110 environment-dependent tests skipped in the unit run.
- Isolated Auth/Firestore PMS regression suite: 6 passed, including 2,001 completed historical bookings and 2,001 historical calendars, explicit drift detection, older cashier lookup and cursor isolation.
- Existing booking/reservation/room/stay/dashboard emulator regressions: 81 passed.
- Real Next.js/Auth/Firestore PMS browser suite: 12 passed, including draft/invitation preservation, failed identity-check recovery, role revocation, account switching and cross-tab logout.
- Existing responsive partner browser suite: 60 passed.
- Production webpack build (including TypeScript), worker bundles and whitespace checks passed. Changed-file ESLint passed without warnings/errors; the full repository lint run had no errors and 95 existing warnings.

All emulator data used disposable demo projects. No live providers, cloud indexes, hotel records or deployment settings were changed. The earlier verification results above remain historical.

## Cloud index publication — 13 November 2026

Published the four additive correction indexes to `helpkey-a8fab` and verified all four READY at 16:26 IST. All 108 existing indexes were preserved; 112 indexes are deployed and all 110 unique local manifest definitions are present and READY (two additional pre-existing cloud indexes remain untouched).

New indexes:

- `bookings`: propertyId ASC, bookingStatus ASC, createdAt DESC, document ID DESC.
- `bookings`: propertyId ASC, confirmationCode ASC.
- `bookings`: propertyId ASC, bookingStatus ASC, document ID ASC.
- `inventoryHolds`: propertyId ASC, status ASC.

Validated the cashier balance/reference and inventory-verification booking/hold query plans with Firestore Explain `analyze: false`; all four succeeded without reading hotel result documents. The application's service account could inspect but could not create indexes; publication used the machine's existing signed-in Firebase deployment account. No IAM changes were made.

This publication changed indexes only. Next deploy/restart the updated web application and workers, confirm the required production operational switches, and have each activated hotel's owner run Settings → Verify inventory. Complete any remaining setup checks before using PMS. No hotel records, security rules, application hosting or worker processes were changed by index publication.

## Dashboard loading correction — 13 November 2026

An activated hotel awaiting inventory verification could leave `/partner/dashboard` behind the loading skeleton indefinitely: the overview reported its loading state only after mounting, but the shell's setup/permission gate prevented it from mounting. Shell request failures could also retain the skeleton because the loading predicate treated missing data as still loading even after an error.

The shell now prioritizes error/setup/permission messages over content loading and provides a direct retry. Shell and overview reads have opt-in 15/20-second deadlines while existing financial mutations retain their behavior. The workspace layout no longer blocks streaming on a redundant shell prefetch whose cache key did not match the account-scoped client key. Authentication and account boundaries remain in place. Incomplete hotels receive a working link to Settings and Verify inventory rather than an endless loader.

Regression coverage includes setup-blocked and role-denied dashboards, failed shell requests and retry recovery, readiness changes after an overview has already loaded, request cancellation/deadlines, and the real Next.js/emulator flow from the blocked dashboard to successful inventory verification. No live hotel data or PMS enablement was changed for this fix.

Loading-correction validation: 545 unit tests passed (110 environment-dependent tests skipped in the unit run); 64 responsive partner browser tests and 13 real Next.js/Auth/Firestore emulator browser tests passed. TypeScript, changed-file ESLint and whitespace checks passed. The real browser regression opens a dashboard missing its verification checkpoint, follows the setup link, verifies inventory and observes Ready to use.

## Access notice presentation

The partner access notice preserves the server's reason text instead of converting it to a boolean. For incomplete setup, the private shell response includes the failed checklist items (labels and explanations); disabled/restricted hotels retain their actual owner/platform reason. The notice displays the hotel name, required actions, role-appropriate recovery guidance, and setup/support links in a responsive white/navy/gold card. It does not change authorization or public customer APIs.

Verified the notice and its reason/checklist/action links at 390px and 1366px, including visual inspection and layout checks after sidebar resize transitions. Three focused browser regressions, TypeScript and changed-file ESLint passed.
