# Queue migration validation — 2026-10-21

The implementation is available behind `BACKGROUND_MODE=legacy|hybrid|queue`, defaulting to legacy. No production application deployment, metadata migration, queue transfer or mode change was performed. See [QUEUE_MIGRATION.md](QUEUE_MIGRATION.md) for the staged procedure.

Verified locally:

- Unit suite: 145 passing tests; four additional authenticated booking-task endpoint tests also pass (149 total). Integration/provider tests skip when their explicit test services/credentials are absent.
- Real Redis + Firestore emulator integration: 39 tests pass, covering the existing 19 booking transaction tests, 10 background recovery tests and 10 direct-delivery/worker tests.
- Real compiled booking-worker processes execute delayed notifications through the authenticated endpoint and schedule successor revisions. A real recovery process reconstructs future timers on startup without another discovery pass during the idle observation window.
- Failure checks cover successful-commit-only submission, transaction retry/abort, chained batches, queue outage after a save, lost queue entries, future timer reconstruction, stale confirmed-booking expiry, preserved notification read state, pagination past malformed records, leadership loss, exhausted-job attention and compatibility with legacy polling. Invalid/missing endpoint secrets and arbitrary document paths are rejected.
- Existing financial tests use mocked Razorpay responses; no real payment or refund was initiated. Media tests mock remote storage/provider calls and exercise actual image transformations.
- Browser regressions: hourly search through authoritative checkout and public catalog telemetry both pass against a queue-mode local Next server and the emulator.
- Production build passes using `npm run build -- --webpack`; worker bundles and typecheck pass. Full lint passes with 61 existing warnings and no errors; the changed queue modules pass focused lint without warnings.
- Docker Compose configuration validates without printing resolved secrets. Queue Redis is isolated from the cache, persists to its own volume, uses AOF and `noeviction`, and has a configurable memory ceiling.
- Local persistence drills: a delayed BullMQ job survives restarting the AOF-backed temporary Redis container. An RDB snapshot restores its job hash and delayed-set entry in a separate temporary Redis process. No live Redis data was flushed or restored.
- Live read-only Firestore index audit: all 100 query shapes plan successfully, including recovery and future-timer rebuild queries; all 64 deployed indexes are READY. The report is [firestore-index-audit-queue.json](firestore-index-audit-queue.json). No indexes or customer documents were changed by this audit.

The healthy idle recovery model is six empty queries every five minutes: about 1,728 minimum document reads/day, compared with the previous modeled 17,856/day. Returned records, processing, startup/rebuild, cleanup and diagnostics add reads. Production savings, CPU/RSS, queue growth and latency under a representative production workload remain to be measured during rollout.

Operational completion requires the production backup destination/daily host schedule, metadata migration, queue reconstruction, staging/provider sandbox smoke tests and the 24-hour hybrid observation gate before queue-only cutover. A single host remains a shared failure domain; Firestore permits work reconstruction after recovery but does not keep a failed server processing jobs.
