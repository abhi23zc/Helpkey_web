# Durable queue delivery and polling migration

## Architecture and operating modes

Firestore remains the source of truth. The application and standalone workers use a shared Firestore adapter that observes transaction/batch writes to background-work records. Each transaction retry collects its own intents; only a committed attempt can submit work. Chained batch commits have the same behavior. Direct document writes do not invoke the adapter: producers of new background work must use the adapter's transaction or batch, including administrative scripts.

Post-commit delivery is awaited with a 1.5-second request-side deadline. An enqueue error never reverses or misreports an already successful Firestore commit. A late Redis acceptance is safe because job IDs are deterministic and effects remain idempotent/fenced. Existing projection/publication outboxes are retained. Booking records, refunds and notification outboxes durably store the next eligible attempt; a separate scheduling collection is unnecessary.

| BACKGROUND_MODE | Behavior |
| --- | --- |
| `legacy` (default) | Existing polling and original Redis queue location/prefix; no automatic post-commit delivery |
| `hybrid` | Direct delivery and new booking consumers/recovery, with legacy discovery retained against the new queue Redis |
| `queue` | Direct delivery and delayed booking jobs, with six recovery queries every five minutes |

No production cutover is performed merely by building this branch. Set the mode consistently across web, scripts and workers. `bun run all` selects the appropriate processes; it omits frequent dispatchers in queue mode. `bun run dev` starts Next, booking processing and (outside legacy mode) recovery. Media/projection processing requires `all` as before.

Configuration:

- `REDIS_URL`: existing application cache; projection invalidation always uses this connection.
- `QUEUE_REDIS_URL`: dedicated queue Redis; mandatory in hybrid/queue mode. Legacy mode deliberately prefers the original `REDIS_URL` to avoid stranding existing jobs.
- `HELPKEY_ENV`: matching environment name on all application/worker processes.
- `BULLMQ_PREFIX`: optional explicit namespace. Existing `helpkey` prefix is preserved by default in legacy mode; new modes default to `helpkey-<environment>`.
- `WORKER_RECOVERY_INTERVAL_MS=300000`: fixed recovery interval; active records do not accelerate this into continuous polling.
- Booking concurrency: expiry/payment/refund = 2 each, notifications = 4. Override `BOOKING_EXPIRY_CONCURRENCY`, `BOOKING_PAYMENTS_CONCURRENCY`, `BOOKING_REFUNDS_CONCURRENCY`, `BOOKING_NOTIFICATIONS_CONCURRENCY`.
- `QUEUE_REDIS_MAXMEMORY=512mb`: Docker queue Redis memory ceiling; choose a host-appropriate limit and monitor usage. `noeviction`, AOF every second and a dedicated volume are configured.

The single-record endpoint `POST /api/internal/bookings/tasks` requires `x-cron-secret` and accepts `{kind, recordId, revision, dueAt}`. Its outcome is completed, stale, rescheduled or attention. Consumers validate the source record before effects. Expiry never applies to confirmed bookings. Schedule revisions are independent by task type; legacy records use revision zero. Existing payment reconciliation, refund IDs, leases, inventory transactions and notification identities remain authoritative.

Business retries use durable timestamps and counters. Queue transport retries do not reset those counters. Exhausted queue records become visible attention work during recovery and require an explicit administrative retry. Redis dispatch outages do not consume processing attempt budgets.

## Recovery and resource budget

The elected recovery worker checks projection outbox, media outbox, booking expiry, payment reconciliation, refunds and notifications. It paginates past malformed records, checks queue state, preserves delayed/active jobs and does not revive terminal work. Leadership checks stop new pages after lease loss; Redis control writes are conditional on the actual owner's lease. Normal processing does not run discovery queries.

Startup rebuilds include **future** timers, not just overdue work. Rebuild progress is checkpointed in Redis; interrupted rebuilds resume safely. Redis generation-marker loss triggers reconstruction. Reconnection wakes recovery immediately. Partial corruption/old backup restoration requires an explicit rebuild request:

```sh
npm run background:rebuild -- --project=helpkey-a8fab
npm run background:rebuild -- --project=helpkey-a8fab --apply
```

The admin endpoint `POST /api/admin/workers` also accepts `{ "action": "rebuild" }`. Requests are durable in Redis and picked up by the recovery service on its next pass. `GET /api/admin/workers` reports queue counts, failed record IDs, attention work, heartbeats and recovery/rebuild status. Existing retry payloads remain compatible; booking attention retries additionally specify `collection: "bookings"` and `kind: "expiry" | "payments"`. Refund attention retries use `collection: "refunds"`. Administrative retry does not modify financial amounts or provider IDs.

At rest: 6 queries × 288 cycles/day = **1,728 minimum empty-query document reads/day**, or 51,840 per 30 days. This is approximately 90.3% below the previous modeled 17,856/day baseline. Startup/rebuild, actual documents, processing, failures, manual diagnostics and hourly cleanup add reads. The estimate is not total application usage or measured billing. During a total outage processing pauses; missed work is normally discovered on the next eligible recovery sweep once dependencies are healthy.

Redis heartbeats do not read Firestore. Missing worker heartbeat after two minutes, recovery older than seven minutes, queue failures and work eligible for more than ten minutes should trigger operational attention. Web readiness reports cache degradation without removing the web process from service solely because Redis is down. Queue health is exposed through authenticated diagnostics.

## Deployment, observation and rollback

1. Build and run unit/integration/browser checks. Record current Firestore usage, queue counts, pending work, processing latency, CPU/RSS and inventory/refund discrepancies. Take existing database/Redis backups.
2. Deploy the compatible code in legacy mode first. Keep the existing Redis and worker data intact. The migration retains old payloads, revisions and terminal states.
3. Start `queue-redis`; verify its persistent volume, available disk and configured memory limit. Keep cache and queue URLs distinct. Do not expose Redis ports publicly.
4. Stop old consumers/dispatchers and allow active work to finish; retain the old Redis volume. Run `npm run background:migrate -- --dry-run --project=helpkey-a8fab`, inspect its counts, then `--apply`. Version-three checkpoints add missing booking due times without resetting processing budgets. Terminal records are never revived. `--restart` explicitly rescans existing checkpoints.
5. Configure **all** application and worker processes for hybrid mode and the same queue namespace. Recreate services. The recovery worker rebuilds active outboxes and future booking schedules from Firestore; do not copy cache keys into queue Redis. Existing media/review generation metadata is preserved. Start media/projection consumers and booking consumers only after compatible code is deployed.
6. Verify the startup rebuild completes, all expected consumers report heartbeats, canary property/review/media updates complete, notification delivery works, and pending booking timers are present. Test checkout, expiry, cancellation, payment reconciliation and refunds in the staging/sandbox environment.
7. Observe hybrid operation for **24 hours**. Require no new unexplained inventory/refund discrepancies, no unexplained overdue work, healthy recovery, stable queue memory and acceptable latency. Hybrid mode intentionally retains extra polling; do not claim queue-mode savings during this period.
8. Set queue mode consistently and recreate services. Disable unused Compose dispatcher services with `--scale dispatcher=0 --scale projection-dispatcher=0`. The binaries also disable discovery defensively in queue mode. Keep recovery and all consumers running.

Rollback: pause new consumers first, set all processes to legacy mode, and restore legacy discovery/consumers against the original Redis. Firestore remains authoritative, so legacy polling can reconstruct unfinished work. Preserve new record metadata and terminal states; do not flush queues, delete indexes, reset refund budgets or run incompatible consumer fleets concurrently. A captured payment after hold expiry follows the existing refund path.

`docs/firestore-index-audit-queue.json` records 100 successful live query plans, including recovery/rebuild queries; all 64 indexes were READY. This check made no production data or index changes. Existing indexes remain in place.

## Backup and restore

Set `QUEUE_BACKUP_DIR` to a separately mounted backup destination. The default `./backups/queue` is only a local convenience, excluded from Git. Run:

```sh
docker compose --env-file .env.local --profile operations run --rm queue-backup
```

The operation obtains an RDB snapshot from queue Redis and retains seven most recent snapshots. Schedule it daily using the host's cron/systemd timer; no cloud scheduler is required. A container on the same host is not high availability, and local backups do not protect against loss of that host/disk. AOF every-second syncing can lose recent acknowledgements; Firestore reconstruction is still required.

Restore drill: pause consumers, preserve the existing queue volume, restore the selected RDB into a **new** Redis volume (start without stale AOF files), verify Redis loading, then re-enable the normal AOF configuration. Point all queue clients at that Redis, request a complete rebuild, validate future timers and pending work, and resume consumers. Do not restore cache data into the queue database. Never run destructive flush/restore commands against the live database as a test.
