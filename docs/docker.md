# Docker

This is the complete local/container runtime for Helpkey. It runs the Next.js app, Redis, the Firestore outbox dispatcher, two media workers, and hourly cleanup. It does not require PM2, Caddy, a VPS, or a host Redis installation.

## First run

Install Docker Engine with the Docker Compose plugin. Add these two values to your ignored `.env.local`:

```env
# Use a long random, URL-safe value.
REDIS_PASSWORD=replace-with-a-strong-password
MEDIA_WORKER_CONCURRENCY=1
```

Keep all existing Firebase, R2, Cloudflare, payment, and `NEXT_PUBLIC_*` variables in `.env.local`. The `NEXT_PUBLIC_*` variables are compiled into the browser bundle, so rebuild the image whenever one changes.

Build and start everything:

```bash
docker compose --env-file .env.local up --build -d
```

Open <http://localhost:3000>. Redis is private to Docker and is not exposed on a host port.

## Daily commands

```bash
# Running containers
docker compose --env-file .env.local ps

# Application and worker logs
docker compose --env-file .env.local logs -f web dispatcher media-worker-1 media-worker-2

# Rebuild after source or NEXT_PUBLIC_* changes
docker compose --env-file .env.local up --build -d

# Stop containers without deleting Redis data
docker compose --env-file .env.local down

# Delete containers and Redis data (destructive)
docker compose --env-file .env.local down -v
```

## One-time legacy-job migration

After starting the normal stack, run this only once to move old Firestore publication jobs into the BullMQ outbox:

```bash
docker compose --env-file .env.local --profile migration run --rm media-migrate
```

The two media-worker containers each use `MEDIA_WORKER_CONCURRENCY=1`; therefore no more than two images are processed at once.
