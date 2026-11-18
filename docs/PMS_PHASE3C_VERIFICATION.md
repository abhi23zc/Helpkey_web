# Phase 3C verification

Verified locally on 2026-11-14. All mutation fixtures use disposable prefixed hotels/accounts on explicitly guarded localhost emulators. No production writes, deployment, index application or feature enablement was performed. Payment providers were mocked or disabled.

## Results

- Full compatible Vitest run: **803 passed**, 21 skipped, 93 test files passed. Command: `FIREBASE_ADMIN_PROJECT_ID=demo-helpkey-pms FIRESTORE_EMULATOR_HOST=127.0.0.1:8092 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm test -- --maxWorkers=2 --testTimeout=30000 --hookTimeout=30000 --exclude tests/booking-guest-details.emulator.test.ts`.
- The excluded guest-history suite requires its own `127.0.0.1:8293` emulator/project. Run separately there: **2 passed**. It deliberately refuses a shared PMS emulator address.
- Final focused stay-change run: **20 passed** (15 emulator, 5 pure). This includes replay financial redaction after role changes.
- Dedicated Playwright suite: **4 passed** (desktop and 390px mobile, device timezone America/Los_Angeles while hotel timezone is Asia/Kolkata). Covers keyboard review, move confirmation, actual history, lost committed response, reload, later permission error, identical payload/key recovery, early-departure explicit retention, and separate checkout/refund semantics. Screenshots were inspected; no horizontal overflow was detected.
- Existing folio/invoice focused regression run: **99 passed**, including transaction suites and documented-reduction restrictions. The full run additionally covers existing booking, payment, stay, notification, readiness, room, cache-generation and lost-response tests.
- Creation/walk-in suites passed with localhost Auth enabled; the readiness suite passed with a 30-second emulator timeout. Earlier five-second timeout failures under concurrent build/browser load were resolved by using the repository's existing CI emulator timeout convention.
- Production Next build, TypeScript, ESLint, worker bundle build and `git diff --check` passed. A final UI formatter correction ensures paise are always shown in financial reviews.

The 21 skipped tests require additional Redis/queue integration or payment-provider sandbox configuration. They were not enabled against live services. The existing shared-cache unit tests exercised enabled cache generations and post-commit hotel isolation; browser fixtures intentionally disable Redis. No claim is made that a real Redis/queue deployment or real provider was exercised.

## Stay-change coverage

The pure and emulator cases verify management-only actions versus reception moves; direct API/service authorization and hotel-bound tokens; dirty, inactive, occupied and maintained rooms; stale room/inventory/rate/payment/invoice dependencies; one winner for competing moves and for the final destination; explicit old-room turnover capacity; preserved elapsed allocations and exact ownership; legacy segment initialization and missing-history rejection; complimentary/charged/credited category changes; added-night date pricing without another fee; hourly midnight and operating-window restrictions; separate checkout and refund; unresolved service commitments; exact replay and changed-payload conflict; expired reviews; advancing server clocks; immutable folio entries; linked invoice reductions; documented-credit reversal guards; and rollback when the final atomic event creation fails.

Availability update: the workflow is now enabled by default for authorized staff and ignores `PARTNER_RESERVATIONS_STAY_CHANGES`. Compatible application/workers and existing required source indexes must be released together. Role permissions and existing allocation/PMS checks still apply. No new composite index is required by the added query shapes. Historical single-unit allocation evidence is required; unsupported historical/group records are reported for reconciliation. Existing 30-night, 24-hour and 32-allocation-day bounds remain, with a 60-room-segment limit.

## Local evidence

Logs are retained under `/tmp/helpkey-phase3c-*` for this workspace session. Browser screenshots: `/tmp/helpkey-phase3c-desktop.png` and `/tmp/helpkey-phase3c-mobile.png`. Test sources and repeatable commands remain in the repository; temporary logs and screenshots are not production artifacts.

## Default availability follow-up

Removed the environment gate for in-house stay changes. Missing and legacy false values no longer disable the workflow, including in production. Existing hotel access, role, allocation/PMS, inventory and financial checks remain enforced. No reservations were moved or modified outside disposable emulator fixtures.

Verification: **23 domain/emulator tests passed** (including three environment-independence cases), **4 desktop/mobile browser tests passed** with the legacy variable explicitly false, TypeScript and worker builds passed, focused lint and whitespace checks passed. No deployment or production data mutation was performed.
