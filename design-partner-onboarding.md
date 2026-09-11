# Helpkey partner onboarding — redesign brief

## Purpose

Redesign the partner onboarding experience so a hotel owner can confidently start, resume, complete, and submit a listing without needing to understand the underlying setup model.

The experience should feel calm, premium, and operationally clear: a partner should always know **where they are, what is required next, whether their work is saved, and what happens after submission**.

This brief is grounded in the current implementation:

- Entry screen: `components/partner/partner-onboarding.tsx`
- Listing workflow: `components/partner/property-setup.tsx`
- Data endpoints: `app/api/partner/onboarding/route.ts` and `app/api/partner/properties/[propertyId]/*`
- Current system styling: `app/globals.css` (Tailwind CSS 4, Plus Jakarta Sans)

No backend workflow change is required for the first redesign. The existing flow already persists drafts, tracks eight steps, supports deep links, uploads media/documents privately, and validates the complete listing before submission.

## Current experience: what to keep and what to change

### Keep

- One-action entry: entering a property name and starting a draft is appropriately low effort.
- Eight meaningful setup stages: type, location, details, rooms/rates, facilities, photos, verification, and review.
- Saved draft state and a visible step count.
- Submission is safely gated by real requirements, including photos, room rates, and identity documents.
- The existing navy foundation and Plus Jakarta Sans font are appropriate for a professional partner product.

### Problems visible in the supplied screens

| Area | Current issue | Customer impact | Design response |
| --- | --- | --- | --- |
| Onboarding home | The empty entry screen is a small, isolated card with no reassurance about time, requirements, or review process. | First-time partners may hesitate or abandon. | Use a stronger page introduction and a compact “What you’ll need” trust panel. |
| Existing listings | Every item uses `Continue`, including approved properties. | “Continue” is misleading when there is no onboarding task to finish. | Show only actionable drafts in “Continue setup”; place approved/pending listings in a separate “Your properties” summary with accurate labels. |
| Listing list | All properties receive equal prominence and there is no last-saved context. | The partner must scan rather than make one obvious next decision. | Feature the most recently edited draft; show remaining tasks, completion percentage, and last saved time. |
| Workflow header | Eight anonymous progress bars communicate quantity but not what is done or next. | Partners cannot orient themselves or safely return to an earlier task. | Use a named desktop stepper and a concise mobile progress control. |
| Workflow navigation | The sticky footer is only useful on step 4; its placement can visually compete with the in-card CTA. | Inconsistent navigation and a large inactive footer area. | Use one persistent action bar for every stage: Back, save status, and a context-specific primary action. |
| Save feedback | Copy promises automatic saving, yet most data is saved when the partner chooses Continue. The UI also moves forward before the save request succeeds. | Users can be unsure whether data is protected; an error can leave the interface visually ahead of the saved draft. | Say “Saved when you continue” until debounced autosave exists. Advance only after a successful save, then show an explicit “Saved just now” state. |
| Review | Incomplete checklist rows identify a problem but do not take the user to the related step. | Recovery is slow, especially with eight stages. | Make each incomplete row a button: “Fix” returns to its relevant step and focuses the first incomplete control. |
| Content model | “Rooms & rates” includes room type, cancellation policy, and rate creation together. | This is the highest cognitive-load stage and currently reads as three parallel mini-forms. | Present it as a guided sub-flow with clear dependency: room → policy → rate, plus saved-item summaries. |

## Recommended information architecture

### Route `/partner/onboarding`: listing hub

The route should be a **listing hub**, not only a form. It has two states.

#### First property / no listings

1. Branded compact header: Helpkey Partners, Help, and an account/menu control.
2. Main start card: “List your property on Helpkey”, one property-name field, and `Start listing`.
3. Adjacent information panel: time estimate, required materials, and “Reviewed before going live.”
4. Three small benefit cards below: reach guests, manage bookings, secure payouts.

#### Partner with listings

1. Header and page title: “Your properties”.
2. A single featured **Resume setup** card for the most recently updated draft.
3. A compact list of remaining drafts, sorted by last saved time.
4. A separate **Live & under review** list for approved, pending, rejected, or changes-requested properties.
5. `Add a property` secondary action. Keep its name field in a dialog or an expandable card below the listings; do not let it dominate the primary resume task.

Use status-specific action language:

| Status | Label | Primary action |
| --- | --- | --- |
| Draft | `Draft · 3 of 8 complete` | `Resume setup` |
| Pending | `Under review` | `View status` |
| Approved | `Live` | `Manage property` |
| Changes requested | `Action needed` | `Review changes` |
| Rejected | `Not approved` | `View feedback` |

### Route `/partner/properties/[propertyId]`: setup workspace

Use one consistent page shell throughout the eight stages.

```text
┌─────────────────────────────────────────────────────────────────┐
│ Helpkey Partners   [‹ Save & exit]        Saved just now  Help  │
├─────────────────────────────────────────────────────────────────┤
│ Property name                           3 of 8 complete         │
│ ● Type ── ● Location ── ● Details ── ○ Rooms ── ○ …             │
├───────────────────────────────────────┬─────────────────────────┤
│ PROPERTY DETAILS                      │ YOUR LISTING            │
│ Tell guests about your property       │ 3 of 8 complete         │
│                                       │ Next: Rooms & rates     │
│ [form or task content]                │ Need help? Contact us   │
├───────────────────────────────────────┴─────────────────────────┤
│ [Back]                                  [Save & continue →]     │
└─────────────────────────────────────────────────────────────────┘
```

- Desktop: named horizontal stepper; current step is navy, completed steps use a green check, future steps are muted. Completed steps may be revisited. Future steps should not be presented as freely navigable until their prerequisites are satisfied.
- Mobile: show `Step 3 of 8 · Property details`, a linear progress bar, and a “Steps” sheet/drawer for completed stages.
- Desktop content width: main form `680–760px`; support rail `280–320px`; total max width `1180px`.
- Hide the side rail below `1024px`; retain its essentials in a collapsible “Need help?” block below the form.
- Keep the bottom action bar in normal visual alignment with the content and give the page enough bottom padding so no control is obscured.

## Workflow design

The product currently has eight persisted stages. Keep those stages so the UI remains aligned with validation and APIs.

| # | Navigation label | Page title | Primary outcome | Completion condition |
| ---: | --- | --- | --- | --- |
| 1 | Property type | What type of place do you host? | A selected category | Property type selected |
| 2 | Location | Where is your property? | Verified guest-facing address | Address, city, state, PIN, coordinates, and place ID saved |
| 3 | Details | Tell guests about your property | Guest-ready description and operational details | Required contact, description, times, and counts saved |
| 4 | Rooms & rates | Add your first room and rate | At least one bookable room | Room, policy, and matching rate created |
| 5 | Facilities | What can guests expect? | Amenities and key policies | At least one amenity plus policy values saved |
| 6 | Photos | Show guests your property | A credible visual set | Six or more photos uploaded |
| 7 | Verification | Verify your ownership | Required documents securely uploaded | PAN and both ID sides uploaded |
| 8 | Review | Review and submit your listing | Submission to Helpkey review | All prerequisites pass |

### Rules for every step

- One primary action. Its label should reflect the result: `Save & continue`, `Add room type`, `Continue to photos`, or `Submit for review`.
- Explain requirements before an action becomes disabled. For example: “Add 2 more photos to continue.”
- Show save state beside the action: `Saving…`, `Saved just now`, or a short inline failure with `Try again`.
- Validate after field blur and again on submit; place field-level errors next to their fields rather than only in a distant message.
- Never advance the visual step until the relevant persistence request succeeds.
- Back navigation should never discard already saved data. If autosave is introduced later, save pending changes before exit and tell the user that this is happening.
- Support `?step=N` only for completed or eligible steps; otherwise redirect to the earliest incomplete required step and explain why.

### Detailed step recommendations

#### 1. Property type

Replace the undifferentiated two-column buttons with selectable cards that have a simple line icon, title, and a short description where necessary. Retain a compact two-column grid on desktop and a one-column grid on narrow screens. `Hotel` should not appear selected by default unless it is deliberately the saved server value; a default can silently introduce bad listing data.

#### 2. Location

The current form asks partners for a Google Place ID, latitude, and longitude. These are implementation details, not customer-facing inputs. Replace them with a property search/autocomplete control and an address confirmation card/map. Persist the existing fields behind that interaction. Offer “My property isn’t listed” as a manual-address fallback.

#### 3. Details

Group fields into three readable sections: “About the property,” “Guest contact details,” and “Check-in and capacity.” Add short helpful examples for the description. Mark only genuinely mandatory fields as required and label optional items explicitly.

#### 4. Rooms & rates

This deserves progressive disclosure rather than three equally weighted panels:

1. Create a room type.
2. Add its price and cancellation policy.
3. Confirm its “Ready to sell” summary.

After the first room is ready, show a summary table/card and `Add another room` as a secondary action. The continue action belongs in the shared action bar and becomes available only after at least one room is sellable.

#### 5. Facilities

Use grouped checkboxes/cards instead of pills that look like tags: Essentials, Food & drink, Accessibility, and Services. Preserve chips only as a compact selected-state summary. Separate guest policies from amenities so the user understands they are distinct decisions.

#### 6. Photos

Retain the 6-photo requirement but turn the count into a clear checklist: exterior, reception/common area, bedroom, bathroom, and optional additional spaces. Display upload progress per file, a clear cover-photo selection, reorder capability, and quality guidance. Explain moderation as “Private until reviewed by Helpkey,” not “your team.”

#### 7. Verification

Put reassurance before the upload controls: encrypted/private storage, documents only used for verification, supported formats, and file limit. Mark the three required files prominently. Use a success check with filename and a `Replace` action after upload.

#### 8. Review

Present a concise listing readiness score and task list. Each incomplete row needs a `Fix` action. The final CTA should be navy (`Submit for review`), while the next-state panel explains: “We’ll review your listing and email you when it is ready or if we need changes.” A success screen should confirm submission, show expected status, and link to the dashboard.

## Visual direction

### Design principles

- Use whitespace and consistent alignment, not oversized cards or excessive decoration, to communicate premium quality.
- Use navy for primary action and navigation; reserve champagne for subtle emphasis, not as an alternate primary button.
- Use green only for verified/completed states and red only for problems needing attention.
- Favor clear labels over clever marketing copy.
- Use familiar line icons from the existing `lucide-react` dependency; pair every icon with text.

### Tokens

Reuse and tune the project’s existing CSS variables rather than introducing an independent theme.

| Token / use | Value |
| --- | --- |
| Primary / action | `--hk-primary` (`#0B1F3A`) |
| Primary hover | `--hk-primary-dark` (`#000615`) |
| Accent / subtle emphasis | `--hk-gold-light` (`#FED88B`) with dark text |
| Page background | `--hk-background-warm` (`#F9F9FF`) |
| Surface | `--hk-surface` (`#FFFFFF`) |
| Primary text | `--hk-ink` (`#141B2B`) |
| Muted text | `--hk-muted` (`#44474D`) |
| Border | `--hk-border` (`#E5E1D8`) |
| Success | `--hk-success` (`#2F7D5C`) |

- Font: retain `Plus Jakarta Sans` via `--hk-font-sans`.
- Page title: `32px/40px`, 700 weight on desktop; `28px/36px` on mobile.
- Step title: `24px/32px`, 700 weight.
- Body: `15–16px/24px`; labels: `14px/20px`, 600 weight.
- Inputs and buttons: minimum `48px` tap target; use `12px` radius consistently.
- Cards: `16px` radius, 1px border, and the existing soft shadow only on elevated/featured cards.
- Meet WCAG 2.2 AA contrast, visible keyboard focus, logical heading order, `aria-current="step"` for the active step, and non-color status indicators.

## Content system

| Situation | Preferred copy | Avoid |
| --- | --- | --- |
| Draft saved | `Saved just now` | `Saved` with no timing/context |
| Draft resume | `Resume setup` | `Continue` |
| Pending approval | `Under review` | `Approved` or `Continue` |
| Required upload | `Required to submit` | A disabled CTA with no reason |
| Photo minimum | `Add 2 more photos to continue` | `Continue` disabled silently |
| Error | `We couldn’t save your changes. Your previous saved information is safe.` | Generic `Could not save.` |
| Submission | `Submit for review` | `Publish` (the listing is not live yet) |

## Implementation plan

### Phase 1 — navigation, correctness, and hierarchy

1. Refactor `PartnerOnboarding` into a listing hub with separate draft and non-draft status treatments.
2. Add a shared `OnboardingShell` to `PropertySetup`: named stepper, save-status region, support rail, and a consistent action bar.
3. Make the primary action save first and advance only on success. Ensure failed saves do not alter the displayed step.
4. Use the existing `onboarding.completedSteps` data to calculate progress and control eligible step navigation.
5. Add review-row `Fix` links to their respective steps.

### Phase 2 — step-level usability

1. Replace exposed location IDs/coordinates with property search and address confirmation.
2. Convert Rooms & rates to a sequential, room-centred setup flow.
3. Add photo cover selection/reordering and clearer per-file progress.
4. Add contextual validation and consistently worded status/error messages.

### Phase 3 — confidence and optimization

1. Introduce debounced autosave only after Phase 1 has reliable explicit saves and visible status.
2. Add events: draft created, step viewed, save failed, step completed, review fix clicked, and submission completed.
3. Measure step completion/drop-off, time to submission, validation-error frequency, and first-pass approval rate.

## Acceptance checklist

- A first-time partner understands the required effort before creating a draft.
- A returning partner can identify the single best next action in under five seconds.
- Approved and pending properties are never labeled `Continue`.
- The active step, completed work, remaining work, and save state are visible at all times.
- Every stage uses one predictable primary action and reliable Back/exit behavior.
- A failed save does not leave the interface on an unsaved future step.
- All blocked actions explain the exact missing requirement.
- The review screen routes every incomplete requirement to a fixable place.
- The experience works at 320px wide, supports keyboard use, and meets WCAG AA contrast.
- The visual language uses existing Helpkey tokens and does not require a global style rewrite.
