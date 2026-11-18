# Phase 2B review — 14 November 2026

Phase 2B is substantially connected: initial collections reuse the existing ledger; creation, capacity and physical assignment commit together; customer identity remains separate; server permissions and shared inventory are retained.

## Resolved finding: unresolved creation could unlock after a later error

`components/partner/dashboard/manual-booking-dialog.tsx:590` treats all HTTP statuses below 500 except 408 as definitive. A prior submission can already have committed even if its response was lost. A subsequent 429, authentication failure or permission failure does not prove that earlier submission did not commit. Nevertheless the handler clears `uncertain`, re-enables editing, and changed input receives a fresh idempotency key.

An additional real Next.js/browser test reproduced this using local Auth/Firestore: successfully create an assigned reservation with a 300.50 rupee advance, drop its response, return a synthetic 429 on the exact-key retry, edit the name and explicitly leave the second submission unassigned. With remaining capacity, the application creates a second reservation and another 30050-paise receipt with the same collection reference. No live provider was charged. The issue is duplicate reservation/recorded collection, not a bypass of same-key transaction protection.

Keep an already uncertain submission frozen across later failures until its original key is positively resolved. Recover through that same key after authentication/rate-limit recovery; do not infer that no booking exists from a new request's status code. Add coverage for lost success followed by 429 and authentication/permission interruptions, including assertions that editing cannot produce a new booking or receipt.

## Verification performed

- Web unit suite: 556 passed, 128 environment-dependent cases skipped.
- TypeScript passed.
- PMS CI domain/emulator checks: 76 passed.
- Separate existing customer booking/payment transaction suite: 32 passed.
- Phase 2B real desktop/mobile browser suite: 6 passed.
- Additional isolated recovery probe confirmed duplicate reservations and recorded advances as described above.
- No product source changes, hosted index publication, production deployment or live-data mutation was performed. Temporary probe source/config files were removed.

## Release and next milestone

Two new composite indexes in firestore.indexes.json must be deployed and READY in the hosted database; emulator success does not verify this. Verify production payment/allocation feature switches and rebuild shared-module workers through the existing release process.

After resolving the recovery finding, proceed to Phase 2C: a hotel-local Today/front-desk workspace with arrivals, departures, in-house guests, unassigned/not-ready rooms, balances, outstanding requests and overdue stays. Reuse the same reservation workspace and preserve hotel/date/filter/back-navigation context. Leave financial folios, moves/extensions, night audit and channels for their agreed later phases.

## Resolution verified — 14 November 2026

The original pending request now retains an uncertainty marker independently of React render state. Once uncertain, later HTTP failures cannot unlock editing or allocate a new request key. A synchronous in-flight guard also rejects overlapping submissions. Initial definitive validation/conflict failures remain editable; successful exact-key recovery shows the saved reservation.

The real desktop/mobile lost-response test now follows the committed-and-dropped response with HTTP 429, 401, 403 and 422 interruptions. Every retry must retain the identical body/key; guest, room and advance inputs stay disabled; eventual recovery must leave exactly one manager booking and one collection for the reference. All six Phase 2B browser tests pass, including ordinary editable room conflicts. Full web unit checks: 556 passed, 128 environment-dependent cases skipped. TypeScript, whitespace checks and lint pass with zero errors and 95 existing lint warnings.

Hosted index metadata was checked in helpkey-a8fab: all 112 required index definitions are READY, including the two Phase 2B indexes. All 114 existing hosted indexes remain present. Six query plans, including room selection and room-calendar lookups, were validated with analyze:false, without fetching hotel documents. No index changes, production deployment or live-data mutations were needed.
