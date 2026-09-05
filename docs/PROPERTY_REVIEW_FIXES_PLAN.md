# Property Review Lifecycle — Implementation Plan

Scope: the partner "Submit for review" → admin decision → partner feedback loop.
Goal: fix live defects, add auditability and notifications, and harden the flow
to be atomic, indexed, and observable — matching the existing schema in
`docs/HELPKEY_DATABASE_SPEC.md`.

Conventions this plan follows (already used across the codebase):
- All writes go through Admin SDK API routes; `firestore.rules` denies direct
  client access. No client-side Firestore.
- Zod validation at every route boundary; `CommonMutableFields`
  (`createdAt/updatedAt/createdBy/updatedBy/deletedAt`) on every document.
- Server re-validates; never trusts the client checklist.
- Timestamps via `FieldValue.serverTimestamp()`; dates serialized to ISO in DTOs.

Terminology: `approvalStatus ∈ { not_submitted, pending, approved, changes_requested, rejected }`,
`status ∈ { draft, pending_review, active, paused, archived }`.

---

## Priority 0 — Live defect: partners never see "changes requested"

### Problem
Admin decision `request_changes` sets `approvalStatus: "changes_requested"`, but
the partner listing view only renders the feedback banner when
`approvalStatus === "rejected"`. `STATUS_LABELS` also has no
`changes_requested` entry, so it falls back to "Draft". Partners are blind to
change requests and cannot act on them.

### Files
- `components/partner/dashboard/partner-property-listing-view.tsx`
- `components/partner/dashboard/use-property-listing.ts` (type only; already carries `approvalStatus`/`rejectionReason`)

### Changes
1. `STATUS_LABELS`: add `changes_requested: "Changes requested"`.
2. Feedback banner condition:
   - From: `property?.approvalStatus === "rejected" && property.rejectionReason`
   - To: `["rejected", "changes_requested"].includes(property?.approvalStatus ?? "") && property.rejectionReason`
   - Banner heading text keyed on status: "Changes requested" vs "Listing rejected".
3. Submit button `disabled` predicate: keep enabled for `changes_requested`
   and `rejected` (resubmission allowed), disabled only while `pending`.
   Verify the existing predicate already allows this; adjust the button label:
   `pending → "Awaiting Review"`, `changes_requested/rejected → "Resubmit for Review"`.
4. Admin side parity: confirm `STATUS_LABELS`/`label()` in
   `components/admin/dashboard/types.ts` render `changes_requested` correctly.

### Acceptance
- Admin picks "request changes" with a reason → partner sees the reason banner,
  status pill reads "Changes requested", button reads "Resubmit for Review".
- Resubmit sets `approvalStatus` back to `pending` and the banner clears.

### Test
- Manual: drive request_changes → reload partner listing → resubmit.
- Unit (if a runner is added later): status→label mapping and banner predicate.

Risk: minimal, presentation-only. No schema change.

---

## Priority 1 — Atomicity + audit trail for state transitions

### Problem
- `submit()` performs two sequential writes (property, partner profile) — not
  atomic. A mid-flight failure leaves inconsistent state.
- Admin `review` and `lifecycle` mutate the property with no immutable record of
  who did what, when, and why. `rejectionReason`/`updatedBy` are mutable and
  overwritten on each cycle. No submission history.

### New collection: `propertyReviewEvents/{eventId}`
Mirrors the pattern of `bookingStatusEvents`. Add to the spec's collection list.

```ts
interface PropertyReviewEventDocument extends CommonMutableFields {
  propertyId: string;
  actorId: string;              // uid or "system"
  actorRole: "partner" | "admin" | "system";
  action: "submitted" | "approved" | "rejected" | "changes_requested"
        | "paused" | "resumed" | "archived" | "restored";
  fromApprovalStatus: string;
  toApprovalStatus: string;
  fromStatus: string;
  toStatus: string;
  reason: string | null;        // required for rejected/changes_requested
  submissionAttempt: number;    // increments per partner submit
}
```

### Index
`firestore.indexes.json`: add
`propertyReviewEvents` composite `(propertyId ASC, createdAt DESC)` for
per-property history reads.

### Files
- `lib/partner/service.ts` — `submit()`
- `app/api/admin/properties/[propertyId]/review/route.ts`
- `app/api/admin/properties/[propertyId]/lifecycle/route.ts`
- `lib/admin/data.ts` — add `recordReviewEvent(tx, ...)` helper + `listReviewEvents(propertyId)`
- `firestore.indexes.json`
- `docs/HELPKEY_DATABASE_SPEC.md` — document the new collection

### Changes
1. Introduce a shared helper `recordReviewEvent(txOrBatch, payload)` in
   `lib/admin/data.ts` that writes a `propertyReviewEvents` doc with
   `CommonMutableFields`. Pure function of its inputs; no reads.
2. `submit()`: wrap the property update + partner-profile update + review-event
   write in a single `adminDb.runTransaction`. Read the property inside the tx,
   compute `submissionAttempt = (previous events count or stored counter) + 1`.
   Store `lastSubmittedAt` (new) and keep `submittedAt` as first-submission
   timestamp (see P3). Guard `pending`/`active` inside the tx to avoid races.
3. `review` route: convert to a transaction — read property (assert `pending`),
   for `approve` re-check approved assets inside the tx, apply the property
   update, and write a `propertyReviewEvents` doc. Single atomic commit.
4. `lifecycle` route: after the property update, write a review event
   (`paused/resumed/archived/restored`) in the same transaction.

### Acceptance
- Every transition produces exactly one `propertyReviewEvents` doc.
- A forced failure in the second write rolls back the first (verified by
  injecting a throw in a scratch test, then removing it).
- History query returns events newest-first for a property.

Risk: medium (transactions). Mitigation: keep reads-before-writes ordering,
no external I/O (R2/notifications) inside the transaction — enqueue those after
commit (see P2).

---

## Priority 2 — Notifications (partner ⇄ admin awareness)

### Problem
No one is told anything. Admin discovers submissions by polling; partner
discovers decisions by reloading. Bell icons are hardcoded.

### Use existing schema
`notifications/{notificationId}` already specced (userId, eventType, title,
body, data, readAt, status). Start with `in_app` only; the
`notificationDeliveries`/`notificationTemplates` machinery is out of scope for
this pass (documented as follow-up).

### Event types (new, additive)
- `property.submitted` → notify all admins.
- `property.approved` / `property.changes_requested` / `property.rejected` → notify the partner (property owner).

### Files
- `lib/notifications/service.ts` (new) — `createNotification`, `createNotificationsForAdmins`, `listNotifications(userId)`, `markRead(userId, ids)`.
- `lib/partner/service.ts` — enqueue admin notification after `submit()` commit.
- `app/api/admin/properties/[propertyId]/review/route.ts` — enqueue partner notification after commit.
- `app/api/notifications/route.ts` (new) — `GET` (list unread + recent for current user), `POST` mark-read.
- `components/partner/dashboard/partner-shell.tsx` and `components/admin/dashboard/admin-shell.tsx` — wire the bell to real counts.
- `firestore.indexes.json` — `notifications (userId ASC, createdAt DESC)` and `(userId ASC, readAt ASC, createdAt DESC)`.

### Design decisions (robustness/perf)
1. Notifications are created **after** the transaction commits, never inside it
   (side effects must not block or be rolled back with core state). Failure to
   create a notification is logged but does not fail the primary action.
2. Admin fan-out: query active admins once
   (`users where roles array-contains "admin"`), batch-write notifications.
   Cap fan-out; if admin count is large, switch to a single
   `eventType: property.submitted` doc consumed by an admin-scoped query
   instead of per-admin docs (documented threshold: >25 admins).
3. Bell polling: lightweight `GET /api/notifications?unread=1&limit=20`, cached
   `no-store`, polled on an interval (e.g. 60s) or on window focus — reuse the
   existing hook patterns, no new realtime layer.
4. `markRead` accepts an array of IDs, validates ownership (`userId === current`),
   sets `readAt` in a batch.

### Acceptance
- Submitting a property creates a `property.submitted` notification for each
  active admin; the admin bell shows the unread count.
- An admin decision creates one partner notification; the partner bell updates.
- Marking read clears the count; re-poll shows 0 unread.

Risk: medium. Mitigation: all notification writes are best-effort and isolated
from core state; wrapped in try/catch with structured logging.

---

## Priority 3 — Submission history & correctness of timestamps

### Problem
`submittedAt` is overwritten on each resubmit; no way to see how many review
cycles occurred or when the first submission happened.

### Changes
- Property doc: keep `submittedAt` = **first** submission; add `lastSubmittedAt`
  = most recent; add `submissionCount` (int, increments per submit).
- `submissionAttempt` on each `propertyReviewEvents` doc (from P1) gives the
  full ordered history for free.
- Admin review drawer: render a compact timeline from `listReviewEvents()`
  (submitted → decision → resubmitted …), read-only.

### Files
- `lib/partner/service.ts` — set `submittedAt` only if absent; always bump `lastSubmittedAt`, `submissionCount`.
- `lib/admin/data.ts` — `listReviewEvents(propertyId)` (indexed query from P1).
- `app/api/admin/properties/[propertyId]/route.ts` or a new `.../events` route — expose the timeline to the drawer.
- `components/admin/dashboard/admin-property-review-drawer.tsx` — render timeline.
- `docs/HELPKEY_DATABASE_SPEC.md` — document the new property fields.

### Acceptance
- First submit sets `submittedAt` and `lastSubmittedAt` equal, `submissionCount = 1`.
- Resubmit leaves `submittedAt`, updates `lastSubmittedAt`, `submissionCount = 2`.
- Drawer shows an accurate, ordered timeline.

Risk: low. Purely additive fields + a read.

---

## Priority 4 — Admin approval UX: enforce asset-approval dependency

### Problem
Property "approve" throws `REQUIRED_ASSETS_NOT_APPROVED` if the admin hasn't
individually approved ≥6 photos + the 3 KYC docs first. The dependency is real
but only surfaces as an error after the click.

### Changes
1. Review drawer computes readiness client-side from `detail` (approved media
   count, approved doc kinds) and:
   - Disables the "Approve" action until assets are approved, with an inline
     checklist ("4 of 6 photos approved", "PAN not yet approved").
   - Keeps request_changes/reject always available.
2. Server stays authoritative — the existing `REQUIRED_ASSETS_NOT_APPROVED`
   guard remains as the backstop (now inside the P1 transaction).

### Files
- `components/admin/dashboard/admin-property-review-drawer.tsx`
- (optional) `lib/admin/data.ts` — a `approvalReadiness(detail)` pure helper reused by UI and server.

### Acceptance
- Approve is disabled with a clear checklist until all required assets are
  approved; enabling it then succeeds.

Risk: low, presentation + a shared pure helper.

---

## Priority 5 — Query performance: indexed admin queues

### Problem
`GET /api/admin/properties` and `overview()` scan `collection.limit(500)` and
filter in memory. `firestore.indexes.json` already has a single-field
`approvalStatus` index but the routes don't use `where`.

### Changes
1. `GET /api/admin/properties?approval=pending`: use
   `.where("approvalStatus","==",approval)` when `approval` is provided; fall
   back to the scan only for the unfiltered directory view (bounded `limit`).
   Keep `search` as an in-memory contains filter over the reduced set (or move
   to a prefix index later — documented follow-up).
2. `overview()`: replace the pending count/urgent scan with a
   `where("approvalStatus","==","pending").orderBy("submittedAt","desc").limit(6)`
   query for `urgentProperties`, and use Firestore `count()` aggregation for
   `pendingListings`/`activeListings`/`pausedListings` instead of loading docs.
3. Add composite indexes as needed:
   - `properties (approvalStatus ASC, submittedAt DESC)`
   - `properties (status ASC, updatedAt DESC)` (directory sort)
4. Cap `mediaAssets`/`verificationDocuments` full scans in `overview()` by using
   `count()` aggregation with `where(...pending)` instead of `limit(1000)` loads.

### Acceptance
- Pending queue and overview metrics return identical results with far fewer
  document reads (verified by read-count logging in dev).
- Required indexes are declared; build/deploy notes updated.

Risk: medium (index deploy + query correctness). Mitigation: land indexes
first, verify queries in dev against seeded data, then switch the routes.

---

## Cross-cutting: robustness, cleanliness, optimization

- **Transactions** wrap all multi-doc state changes (submit, review, lifecycle).
- **Side effects after commit**: notifications and any R2/email work run outside
  the transaction, best-effort, isolated with try/catch + structured logs.
- **Single source of truth for validation**: extract the submit-readiness and
  approval-readiness checks into pure helpers reused by both the server guard
  and the UI, so client and server never disagree.
- **DTO discipline**: continue serializing timestamps to ISO; never leak
  Firestore field-value objects to the client.
- **Indexes declared** for every new query; no unbounded scans on hot paths.
- **Zod** schemas for the new notification routes and events payloads.
- **No behavioral regressions to the optimistic listing editor** shipped
  earlier; the partner listing view keeps local-merge + min-visible spinners.

## Verification strategy (per priority)
1. `npx tsc --noEmit` — type safety after each priority.
2. `npx eslint <changed files>` — 0 errors (repo enforces strict react-hooks rules).
3. `npm run build` — full compile including new routes.
4. Manual end-to-end against dev: submit → admin queue appears → asset approve →
   property approve/request_changes/reject → partner sees result + notification →
   resubmit. Confirm review-event docs and notification docs are written.
5. Read-count spot check for P5 (dev logging) to confirm the optimization.

## Suggested sequencing (each independently shippable)
P0 → P1 → P3 → P2 → P4 → P5.
Rationale: fix the live defect first; establish atomic transitions + audit
before layering notifications and history UI on top; UX and perf last since they
depend on the event/notification foundations.

## Explicitly out of scope (documented follow-ups)
- Email/SMS/WhatsApp delivery via `notificationDeliveries`/`notificationTemplates`.
- Realtime (onSnapshot) notification/bell updates — polling is sufficient now.
- Full-text property search index.
