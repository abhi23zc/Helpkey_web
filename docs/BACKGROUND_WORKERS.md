# Background processing operations

For the new post-commit/BullMQ delivery path, dedicated queue Redis, five-minute recovery and staged cutover, see [QUEUE_MIGRATION.md](QUEUE_MIGRATION.md). The polling behavior below describes the default legacy mode retained for rollback.

## Behavior and read budget

The existing stack is retained. `bun run dev` runs web + booking maintenance; `bun run all` also runs media/projection dispatchers and workers. Production uses the compiled Node workers in Compose.

Idle dispatchers/notifications back off 2 → 4 → 8 → 16 → 30 seconds. Finding work resets the schedule and drains batches. Expiry waits 15 seconds; payment/refund maintenance waits 60 seconds. Individual financial records have separate due times and fenced leases. Redis leadership avoids duplicate polling by replicas; transaction checks protect effects independently. A dev booking runner without REDIS_URL runs as a single-instance fallback.

Steady idle query estimates per 24 hours: media 2,880; projections 2,880; notifications 2,880; expiry 5,760; payment recovery 1,440; refunds 1,440; media/projection queue recovery 576 combined. Total about **17,856**, excluding startup, health-dashboard requests, actual jobs, cleanup, rebuilds and website use. This is a query-based estimate, not measured billed usage. Empty Firestore queries consume a minimum document read. Redis readiness/heartbeat checks do not query Firestore.

Normal healthy idle pickup targets are 30 seconds for media/projections/notifications, 15 seconds for expiry, 60 seconds for financial maintenance. Processing, provider time, outages and backlog add latency. Direct payment verification and verified webhooks do not wait for maintenance.

## Configuration

All interval values are positive integer milliseconds. Invalid values fail startup.

| Variable | Default |
| --- | ---: |
| PROJECTION_IDLE_INTERVAL_MS | 30000 |
| MEDIA_IDLE_INTERVAL_MS | 30000 |
| BOOKING_EXPIRY_INTERVAL_MS | 15000 |
| BOOKING_PAYMENT_INTERVAL_MS | 60000 |
| BOOKING_REFUND_INTERVAL_MS | 60000 |
| BOOKING_NOTIFICATION_INTERVAL_MS | 30000 |
| WORKER_RECOVERY_INTERVAL_MS | 300000 |
| PROJECTION_DISPATCH_BATCH_SIZE | 50 (max 200) |
| MEDIA_DISPATCH_BATCH_SIZE | 50 (max 200) |
| PROJECTION_WORKER_CONCURRENCY | 4 (max 64) |
| MEDIA_WORKER_CONCURRENCY | 1 (max 16) |

HELPKEY_ENV must match across web/workers sharing a Redis instance. Use separate Redis databases/queue prefixes for different deployments. Preserve Redis AOF persistence and `noeviction`; monitor memory and persistence failures. More worker concurrency increases overlapping reads and memory, not necessarily throughput.

## Deployment and existing data

Do not mix old and new worker binaries: old media workers do not understand publication generations, and old review processors do not honor aggregate fencing.

1. Capture baseline Firestore usage, queue counts, errors, process RSS/CPU and update latency. Take your normal database backup. Deploy the additive indexes in `firestore.indexes.json` and wait until ready.
2. Pause the old booking/media/projection workers and dispatchers; drain in-flight jobs before terminating them. Keep the web service available. Do not delete Redis or its volume.
3. Deploy the new web image. Keep workers paused until legacy records have been prepared. New API writes already include due times and durable versioned events.
4. Run `npm run background:migrate -- --dry-run --project=YOUR_PROJECT`, review counts, then use `--apply` with the same explicit project. This adds missing due/recovery fields, preserves terminal failures and replaces unfinished legacy media requests with generation-safe requests. It does not reset terminal processing budgets. Checkpoints resume after interruptions; use `--restart` with `--apply` to deliberately rescan from the beginning. Dry runs always scan from the beginning.
5. Optionally prebuild reviews with `npm run reviews:rebuild -- --dry-run --project=YOUR_PROJECT`, then `--apply`. Use `--property=ID` for canary rollout or repair. Rebuilds create shadow generations, checkpoint their cursor, and activate only after source-revision checks pass. Concurrent changes restart an outdated shadow; active summaries stay readable. A first review job also bootstraps an uninitialized property safely.
6. Start only the new workers/dispatchers. Inspect health and let pending work drain. Never flush the queues to perform an upgrade.
7. Run `npm run reviews:rebuild -- --verify --project=YOUR_PROJECT --property=ID` on canary properties. Verification is read-only and compares current authoritative reviews with the active summary. Repeat without a property to verify all. Re-run a property rebuild explicitly if needed; retain old generations for rollback analysis.

New derived collections are server-only under the existing deny-by-default Firestore rules. No browser computation or client write permission is added. Catalog HTTP responses use no-store so intermediary caches cannot bypass Redis generation invalidation; internal Redis TTLs remain in use. Existing HTTP DTOs remain compatible; internal projection payloads add component selection and review identity. Legacy projection payloads use a full refresh/rebuild.

Rollback scheduling through environment settings. If correctness fails, stop the affected workers and retain durable records; deploy a processor compatible with the new schemas. Do not run the old aggregate writers against activated generations or revert to colon-containing media job IDs. Old published image URLs remain valid until replaced/unpublished.

## Inspection and retry

`GET /api/health/ready` reports web/Redis readiness without database polling. Compose waits for this before starting booking maintenance.

Authenticated admins can use `GET /api/admin/workers` for logical poller and per-replica processor heartbeats, failures and overdue recovery records. Worker heartbeats expire after 120 seconds. It lists at most 25 records per category; it is not a global count. Connect this endpoint and structured logs to your existing monitoring; no external messages are sent by the application.

Alert on an expected worker missing for >120 seconds, increasing oldest-pending age, any quarantined/dead/attention financial work, repeated `worker.poll_failed`, `provider.failure`, or `record.lease_renew_failed`, and Redis persistence/memory problems. A queue recovery record >5 minutes overdue is exposed in the endpoint. New requests may be pending before their first recovery time, so monitor enqueue-to-completion latency in logs as well.

`POST /api/admin/workers` accepts `{collection,id}` for failed projection/media outboxes or notification events. It validates payloads and creates a fresh request for projections/media; superseded media requests are rejected. Invalid payloads require correction before retry. Existing admin projection/media retry endpoints remain available. Refund retry remains under the booking-specific authenticated admin route; inspect provider state before retrying a permanent failure. Never create a different refund identity to bypass an ambiguous provider result.

Outboxes retain dispatch failures and terminal failures. Workers commit effects before acknowledging completion. If invalidation fails after an effect commits, a retry completes invalidation without losing the source update. Recovery checks queue state before requeueing and preserves the six-attempt processing budget across Redis loss.

## Verification

Run lint, typecheck, unit tests, worker builds and the production Next.js build. Existing lint warnings outside this change are not rewritten.

For integration tests, use an isolated demo Firestore emulator and disposable Redis instance:

```
FIRESTORE_EMULATOR_HOST=127.0.0.1:8092 TEST_REDIS_URL=redis://127.0.0.1:6379 npm run test:workers:integration
```

The integration suite refuses remote service addresses. CI supplies Redis and runs Firestore through Firebase tools. It exercises queue loss, retries, fencing, review deltas/windows, media generations and the booking transaction suite. Razorpay sandbox checkout/refund tests require explicit test-mode configuration; never run them with live keys. Playwright hourly/overnight flows require a local server pointed to the same demo emulator.

Compare measured Firestore document reads, not just API-call counts. `outbox.scan` records returned documents and query calls separately; all billed reads, index costs and retries must be assessed from provider usage metrics. Benchmark worker RSS/CPU and p95 processing latency using representative property/review sizes before increasing concurrency.
