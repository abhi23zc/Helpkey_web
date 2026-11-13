# GitHub CI and production deployment

Every push and pull request runs lint, route type generation, TypeScript, unit
tests, a Next.js production build, worker builds, Redis/Firestore worker tests,
and Firestore/Auth PMS, partner, and stay transaction tests. Emulator tests use
demo projects; payment providers remain mocked.

A push to a feature branch runs CI only. A push or merge to `main` calls the
reusable Deploy workflow after all three CI jobs succeed. Deployment uses the
tested commit SHA, skips commits superseded on `main`, builds the image before
replacing services, and waits for Compose readiness. A failed deployment does
not automatically roll back.

## Production requirements

- Repository secrets: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`.
- GitHub environment: `Production`.
- VPS checkout: `/opt/helpkey/Helpkey_web`, with no modified tracked files and
  permission to fetch the private GitHub repository.
- Docker Engine and Docker Compose v2 with `up --wait` support.
- A complete `.env.local` on the VPS. GitHub secrets are not copied to this file.
  Compose supplies its `NEXT_PUBLIC_*` values as Docker build arguments; server
  credentials remain runtime environment variables. Set `REDIS_PASSWORD` and
  the provider and Firebase configuration required by the application.
- Firestore indexes must already be deployed and READY. This workflow does not
  publish indexes or rules. See `PMS_PHASE1.md` for the recorded index deployment.
- To enable PMS operations, set `PARTNER_RESERVATIONS_ALLOCATION`,
  `PARTNER_RESERVATIONS_PAYMENTS`, `PARTNER_ROOMS_CALENDAR`, and
  `PARTNER_ROOMS_HOUSEKEEPING` to `true` in the VPS environment. Each hotel's
  owner must complete setup, run Settings → Verify inventory, and activate PMS.
  These operational settings are independent of CI success.

The Compose web health check verifies that the application responds. Successful
CI and container readiness do not verify live payment delivery, Firebase sign-in,
external provider credentials, or individual hotel setup.

## Verification on 13 November 2026

- Workflow syntax and reusable job wiring passed actionlint 1.7.7.
- ESLint passed with 0 errors and 95 existing warnings; TypeScript passed.
- 553 unit tests, 52 booking/worker integration tests, and 64 PMS/partner/stay
  integration tests passed. Two dedicated-port guest-details emulator tests and
  one live Razorpay sandbox test were not run.
- Worker bundles, the webpack production build, Compose validation, and the
  Linux production Docker build (default Turbopack) passed.
- The production image started without external networking. Readiness and the
  privacy-policy page returned HTTP 200; worker bundles, Sharp, and BullMQ were
  present. This image used no production environment credentials.
- The three deployment secret names exist in GitHub, and the most recent
  existing production deployment succeeded. Secret values and current VPS
  configuration were not inspected. No code was pushed or deployed by this review.
