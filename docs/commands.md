# Helpkey command library

Use this page as the quick reference for local Docker development and the single-server Docker deployment. Run commands from the project directory unless noted otherwise. Never paste `.env.local` or secret values into chat, Git, or logs.

## Docker: start and stop

```bash
# Build the image and start the complete stack in the background
docker compose --env-file .env.local up --build -d

# Start existing images without rebuilding
docker compose --env-file .env.local up -d

# Stop containers, preserving Redis data
docker compose --env-file .env.local down

# Restart every service
docker compose --env-file .env.local restart

# Recreate services after changing Compose or environment configuration
docker compose --env-file .env.local up -d --force-recreate
```

The app is available at `http://localhost:3006`. The container itself listens on port `3000`.

## Docker: status and logs

```bash
# Service status and health
docker compose --env-file .env.local ps

# All logs
docker compose --env-file .env.local logs -f

# Web logs
docker compose --env-file .env.local logs -f web

# Dispatcher and media worker logs
docker compose --env-file .env.local logs -f dispatcher media-worker-1 media-worker-2

# Cleanup logs
docker compose --env-file .env.local logs -f cleanup

# Last 100 lines without following
docker compose --env-file .env.local logs --tail=100 web

# Redis health
docker compose --env-file .env.local exec redis sh -c 'redis-cli -a "$REDIS_PASSWORD" ping'
```

## Docker: shell and diagnostics

```bash
# Open a shell in the web container
docker compose --env-file .env.local exec web sh

# Test the app from the host
curl -I http://127.0.0.1:3006

# Test the search API
curl -sS 'http://127.0.0.1:3006/api/search/properties?destination=kanpur' | head

# Validate Compose without starting anything
docker compose --env-file .env.local config -q

# See which process owns port 3006
ss -ltnp | grep ':3006'

# List images and disk usage
docker image ls
docker system df
```

## Docker: update after code changes

```bash
git pull origin main
docker compose --env-file .env.local up --build -d
docker compose --env-file .env.local ps
```

Do not run `down -v` for a normal update. It deletes named volumes, including the local Redis data:

```bash
# Destructive: deletes containers AND named volumes
docker compose --env-file .env.local down -v
```

## Media workers

```bash
# Run the one-time legacy Firestore job migration
docker compose --env-file .env.local --profile migration run --rm media-migrate

# Confirm both workers are running
docker compose --env-file .env.local ps media-worker-1 media-worker-2

# Follow worker activity
docker compose --env-file .env.local logs -f media-worker-1 media-worker-2
```

Each worker uses `MEDIA_WORKER_CONCURRENCY=1`; two worker containers provide an effective concurrency of two.

## VPS and domain

```bash
# Connect to the server
ssh deploy@YOUR_VPS_IP

# Enter the application directory on the server
cd /opt/helpkey

# Pull and deploy the newest commit
git pull origin main
docker compose --env-file .env.local up --build -d

# Check the local app endpoint on the server
curl -I http://127.0.0.1:3006

# Check the public HTTPS endpoint
curl -I https://YOUR_DOMAIN

# Caddy status and logs (if Caddy is installed on the host)
sudo systemctl status caddy
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo journalctl -u caddy -f

# Firewall status
sudo ufw status
```

The public reverse proxy should target `127.0.0.1:3006`. Do not expose ports `3006` or `6379` publicly.

## Firebase rules and indexes

```bash
# Deploy rules only
npx --yes firebase-tools deploy --only firestore:rules --project helpkey-a8fab

# Deploy indexes only
npx --yes firebase-tools deploy --only firestore:indexes --project helpkey-a8fab

# Deploy both
npx --yes firebase-tools deploy --only firestore --project helpkey-a8fab
```

If an index says `currently building`, wait for Firebase to finish building it before testing the cleanup worker.

## Local development and verification

```bash
npm ci
npm run dev
npm run dev:all
npx tsc --noEmit
npm run lint
npm run build
npm run build:workers
```

Use `npm run dev:all` when you need Next.js, the dispatcher, and both media workers together. Run `npm run worker:cleanup` separately when you want a cleanup pass. Use `npm run dev` for the web app only. The development server uses `http://localhost:3000`; the Docker Compose server uses `http://localhost:3006`.

## Port and container recovery

```bash
# Find what occupies port 3006
ss -ltnp | grep ':3006'

# List all containers, including stopped ones
docker ps -a

# Recreate only the web service
docker compose --env-file .env.local up --build -d --force-recreate web

# Restart a failed worker
docker compose --env-file .env.local restart media-worker-1

# Show the last failure for cleanup
docker compose --env-file .env.local logs --tail=100 cleanup
```

## Secrets and environment

```bash
# Generate a random value; copy it directly into your password manager
openssl rand -hex 32

# Restrict local environment-file permissions
chmod 600 .env.local

# Confirm only variable names exist (does not print values)
sed -E 's/=.*//' .env.local | sed '/^\s*#/d;/^\s*$/d'
```

Rotate a credential immediately if its value appears in a terminal capture, screenshot, Git diff, issue, or chat message.
