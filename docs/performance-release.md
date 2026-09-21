# API performance release runbook

This release keeps Firestore source collections and Firebase identities intact. New search fields, review metrics, daily metrics, outbox documents, and Redis entries are backward-compatible. The inventory collection remains `roomNightInventory`; renaming it is deliberately outside this release.

## Required configuration

- `REDIS_URL` and `REDIS_PASSWORD`
- `CURSOR_SIGNING_SECRET` (a stable, random production secret)
- `HELPKEY_ENV=production`
- `OTEL_EXPORTER_OTLP_ENDPOINT` and optional `OTEL_SERVICE_NAME`
- Existing Firebase, R2, Razorpay, Cashfree, and WhatsApp credentials
- `PUBLIC_RESPONSE_CACHE_DISABLED=1` disables shared public response caching.
- `PUBLIC_MEDIA_DUAL_READ=true` enables the temporary approved-private-media fallback.

## Cutover

1. Record route p50/p95/p99, error rate, Firestore operations, cache hits, and provider latency from the current release.
2. Deploy `firestore.indexes.json` and wait until every composite index reports ready.
3. Verify Redis persistence and health: `docker compose exec redis redis-cli -a "$REDIS_PASSWORD" ping`.
4. Preview each projection:
   - `npm run projection:backfill -- --kind=property_search --dry-run`
   - `npm run projection:backfill -- --kind=review_summary --dry-run`
   - `npm run projection:backfill -- --kind=daily_metrics --dry-run`
5. Run each backfill without `--dry-run`. It checkpoints by document ID and safely resumes after interruption. Use `--restart` only for an intentional full reconciliation.
6. Verify projections with the same commands plus `--verify`; investigate any non-zero missing count.
7. Build the web image and both worker bundles. Deploy web, media dispatcher/workers, projection dispatcher/worker, and cleanup together.
8. Smoke-test sign-in/logout, catalog search, hotel detail, booking sandbox, partner property switching/listing/rooms/reservations/reviews, admin lifecycle/KYC previews, notifications, and webhook replay.
9. Run `PLAYWRIGHT_BASE_URL=https://<host> npm run test:e2e` and `LOAD_TEST_URL=https://<host>/api/home npm run load:test`.
10. Accept only if normal-read p95 is below 1 second, major-page data p95 is below 2 seconds, errors do not regress, queues are current, and booking/payment/inventory consistency checks pass.

## Operations

- Projection failures and dead letters: `GET /api/admin/projections`; retry with `POST /api/admin/projections` as an active admin.
- Projection backfill state: `backfillCheckpoints/projection_<kind>`.
- Outbox state: `projectionOutbox`; completed/dead job state: `projectionJobs`.
- Public cache can be disabled independently with `PUBLIC_RESPONSE_CACHE_DISABLED=1`; source-of-truth reads continue.
- Redis loss falls back to Firebase/Firestore for authentication and ordinary reads. OTP, Aadhaar, payment, private-media, and other fail-closed safety limits return a retry-safe 503.

## Rollback

Roll back the web and worker image together. Leave indexes and backward-compatible projection fields/documents in place. If projection reads are suspected, disable public response caching and keep the prior application image active while the outbox is inspected. Do not delete Firestore source fields, booking snapshots, inventory holds, payment events, or Firebase users during rollback.
