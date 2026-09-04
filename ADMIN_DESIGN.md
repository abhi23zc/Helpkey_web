# Helpkey Dashboard Design System

## 1. Product Direction

Helpkey dashboards are trustified operations platforms for a premium hotel booking business. The dashboard experience must feel secure, mature, clear, and action-oriented.

This document covers:

- Admin dashboard pages
- Partner dashboard pages
- Shared dashboard layout, colors, typography, cards, tables, forms, and safety patterns

The selected dashboard theme is **Midnight Navy + Champagne**.

The dashboards should feel:

- Premium and trustworthy
- Clean, calm, and operational
- Suitable for real hotel, booking, payment, and support workflows
- Easy to scan under pressure
- Responsible with money, customer accounts, reviews, and booking changes
- Consistent across admin and partner views

Do not make the dashboards look like a marketing landing page. These are working tools for admins, hotel partners, finance teams, support agents, and property managers.

## 2. Theme Principles

Use **Midnight Navy** for trust, structure, navigation, and primary actions.

Use **Champagne Gold** for premium accents, ratings, selected outlines, warning attention, and high-value highlights.

Use **Warm Ivory** for the main page background so the UI feels softer and more premium than plain white.

Use **White Cards** for working surfaces, tables, forms, inspectors, and detail panels.

Use **status colors carefully**. Green means verified/success. Amber means needs attention. Red means risk or destructive action. Blue means informational or processing.

## 3. Color Tokens

### Core Palette

| Token              | Name           | Hex       | Usage                                                 |
| ------------------ | -------------- | --------- | ----------------------------------------------------- |
| `--color-navy-950` | Deep Midnight  | `#06142B` | Sidebar, primary buttons, selected nav, major actions |
| `--color-navy-900` | Midnight Navy  | `#0A1F3C` | Header accents, active states, dark cards             |
| `--color-navy-800` | Executive Navy | `#102B52` | Hover states, secondary dark surfaces                 |
| `--color-gold-500` | Champagne Gold | `#D8B46A` | Premium accents, stars, badges, selected borders      |
| `--color-gold-600` | Deep Champagne | `#C6973E` | Strong gold text, chart lines, active highlights      |
| `--color-gold-100` | Champagne Wash | `#FBF3DF` | Soft gold backgrounds and alert panels                |
| `--color-ivory-50` | Warm Ivory     | `#F7F4EE` | Main dashboard background                             |
| `--color-white`    | White          | `#FFFFFF` | Cards, panels, inputs                                 |
| `--color-ink`      | Ink Navy       | `#111827` | Main text, headings, table values                     |
| `--color-muted`    | Slate Gray     | `#6B7280` | Secondary text, captions, metadata                    |
| `--color-border`   | Warm Border    | `#E6E2DA` | Card borders, dividers, input borders                 |

### Status Palette

| Token                | Name            | Hex       | Usage                                    |
| -------------------- | --------------- | --------- | ---------------------------------------- |
| `--color-success`    | Verified Green  | `#0F8A5F` | Paid, verified, live, approved, low risk |
| `--color-success-bg` | Success Wash    | `#EAF7F1` | Success chips                            |
| `--color-warning`    | Attention Amber | `#F2A900` | Pending, attention, SLA warning          |
| `--color-warning-bg` | Warning Wash    | `#FFF6DB` | Pending chips and warning panels         |
| `--color-danger`     | Risk Red        | `#D92D20` | Failed, disputed, destructive action     |
| `--color-danger-bg`  | Danger Wash     | `#FEECEC` | Sensitive action panels                  |
| `--color-info`       | Info Blue       | `#2563EB` | Processing, assigned, active stay        |
| `--color-info-bg`    | Info Wash       | `#EAF1FF` | Info chips                               |

### Color Usage Ratio

- `55%` warm ivory page background
- `28%` white cards and panels
- `10%` midnight navy navigation and primary action areas
- `4%` champagne gold accents
- `3%` status colors

Never make the whole dashboard dark. Keep the dashboard mostly light, with navy used as a strong anchor.

## 4. Typography

Recommended font:

```css
font-family: "Plus Jakarta Sans", "Manrope", system-ui, sans-serif;
```

Use a clean premium sans-serif. Avoid decorative fonts inside dashboards.

### Desktop Type Scale

| Token     | Size   | Weight | Line Height | Usage                                  |
| --------- | ------ | ------ | ----------- | -------------------------------------- |
| `display` | `32px` | `700`  | `1.15`      | Large dashboard titles only            |
| `h1`      | `28px` | `700`  | `1.2`       | Page titles                            |
| `h2`      | `22px` | `700`  | `1.25`      | Card section titles                    |
| `h3`      | `18px` | `700`  | `1.3`       | Inspector headings, table panel titles |
| `body`    | `15px` | `400`  | `1.5`       | Main readable text                     |
| `body-sm` | `14px` | `400`  | `1.45`      | Table rows, helper text                |
| `label`   | `13px` | `600`  | `1.35`      | Form labels, chip text                 |
| `caption` | `12px` | `500`  | `1.35`      | Metadata, timestamps                   |
| `metric`  | `28px` | `700`  | `1.1`       | KPI values                             |
| `price`   | `24px` | `700`  | `1.1`       | Revenue, payout, booking totals        |

### Typography Rules

- Page titles should be bold and direct.
- Tables must be readable. Do not go below `12px`.
- KPI numbers should be visually stronger than their labels.
- Use muted text for helper copy, timestamps, and secondary metadata.
- Do not overuse uppercase. Use uppercase only for tiny section labels or compliance tags.

## 5. Layout System

### Dashboard Shell

Use a fixed sidebar and fluid content area.

```css
.dashboard-shell {
  display: grid;
  grid-template-columns: 264px minmax(0, 1fr);
  min-height: 100vh;
  background: #f7f4ee;
}
```

### Sidebar

Sidebar style:

- Width: `248px` to `272px`
- Background: `linear-gradient(180deg, #06142B 0%, #0A1F3C 100%)`
- Text: white with muted blue-gray secondary text
- Active item: translucent navy/white overlay with champagne left border
- Icon color active: champagne gold
- Border radius for nav item: `12px`

Sidebar sections:

- Logo area
- Navigation
- Help/support card
- Sync/status or plan card
- User profile footer

Admin nav:

- Dashboard
- Bookings
- Hotels
- Partners
- Users
- Payments
- Reviews
- Support
- Settings

Partner nav:

- Overview
- Reservations
- Calendar
- Rooms & Rates
- Property Listing
- Reviews
- Payouts
- Promotions
- Messages
- Settings

### Main Content

Main page padding:

```css
.dashboard-main {
  padding: 24px 32px 32px;
}
```

Use a `24px` spacing grid.

Recommended max width:

- Standard dashboards: `100%`
- Wide enterprise dashboards: `1600px`

### Header

Top header should include:

- Page title and subtitle
- Search
- Date range or property switcher
- Primary action button
- Notification bell
- User profile

Keep header height around `72px`.

## 6. Component System

### Cards

Use cards for every meaningful information group.

```css
.card {
  background: #ffffff;
  border: 1px solid #e6e2da;
  border-radius: 18px;
  box-shadow: 0 12px 30px rgba(6, 20, 43, 0.06);
}
```

Card rules:

- Use `16px` to `24px` internal padding.
- Keep card titles short.
- Use subtle dividers for dense content.
- Avoid heavy shadows.
- Use champagne outlines only for selected rows/cards.

### KPI Cards

KPI cards should include:

- Icon circle
- Label
- Large value
- Trend chip
- Comparison text

Icon circle:

```css
background: #fbf3df;
color: #c6973e;
```

Trend chips:

- Up positive: green wash
- Down negative: red wash
- Attention/pending: champagne wash or amber wash

### Buttons

Primary button:

```css
background: #06142b;
color: #ffffff;
border-radius: 10px;
height: 44px;
```

Primary hover:

```css
background: #0a1f3c;
```

Secondary button:

```css
background: #ffffff;
color: #06142b;
border: 1px solid #c8cdd6;
```

Champagne outline button:

```css
background: #ffffff;
color: #9a6b18;
border: 1px solid #d8b46a;
```

Danger button:

```css
background: #d92d20;
color: #ffffff;
```

Danger outline button:

```css
background: #ffffff;
color: #d92d20;
border: 1px solid #f2a9a3;
```

### Inputs

Input style:

- Height: `42px` to `48px`
- Radius: `10px` to `12px`
- Border: `#E6E2DA`
- Background: white
- Focus border: champagne gold or navy
- Focus shadow: subtle champagne glow

Use labels above inputs in dense forms.

### Status Chips

Use compact rounded chips.

Common statuses:

- `Paid`
- `Pending`
- `Confirmed`
- `Active Stay`
- `Completed`
- `Cancelled`
- `Refunded`
- `Disputed`
- `Live`
- `Draft`
- `Pending Review`
- `Changes Requested`
- `Verified`
- `Low Risk`
- `Requires Confirmation`

Chip sizes:

- Height: `24px` to `28px`
- Radius: `999px`
- Font: `12px`, weight `600`

### Tables

Tables are the main dashboard working pattern.

Rules:

- Header row background: white or very light ivory
- Row height: `64px` to `76px`
- Selected row: champagne border or warm ivory highlight
- Use sticky table header for long lists
- Include pagination
- Keep actions in a kebab menu unless actions are primary to the workflow
- Use status chips, not raw status text

### Inspector Panels

Use a right-side inspector for selected records.

Inspector should show:

- Selected object title
- Status chip
- Key details
- Related records
- Safe actions
- Sensitive actions
- Notes
- Audit log

Inspector width:

- Normal: `420px` to `520px`
- Dense finance/support: `520px` to `640px`

## 7. Responsible UX Rules

Helpkey must feel trusted because it handles bookings, money, reviews, customer accounts, and partner approvals.

### Sensitive Actions

Never make these actions primary or casual:

- Cancel booking
- Issue refund
- Approve partner
- Reject partner
- Pause listing
- Lock account
- Remove payment method
- Hide review
- Mark no-show
- Override policy
- Bulk price update
- Delete live photo
- Unpublish listing

Sensitive actions must:

- Sit inside a clearly labeled `Requires Confirmation` area
- Use red outline or warning styling
- Require an admin/partner note when appropriate
- Show consequence microcopy
- Be logged in the audit log

### Confirmation Copy

Use direct, calm language:

- `This action may affect the guest booking.`
- `This action is logged and can be reviewed.`
- `Refunds require finance approval.`
- `Bulk changes require preview before saving.`
- `Publishing changes may require Helpkey review.`

### Audit Log Pattern

Every operational page should include a small audit/activity log.

Audit log fields:

- Event name
- Date and time
- Actor
- System or user source
- Status change if relevant

### Empty States

Empty states should be useful:

- State what is empty
- Explain what it means
- Offer one next action

Example:

`No refund requests pending. New refund cases will appear here when guests request payment adjustments.`

## 8. Admin Dashboard Pages

### Admin Overview

Purpose: central business control room.

Main sections:

- Total Revenue
- Bookings Today
- Pending Partners
- Cancellation Rate
- Revenue analytics chart
- Booking status donut
- Pending partner approvals
- Recent bookings table
- Support tickets
- Quick actions

Primary actions:

- Add Hotel
- Verify Partner
- Refund Request
- Send Promo

UX notes:

- Keep this page broad, not deep.
- Prioritize what needs admin attention today.
- Use charts only when they help decisions.

### Partner Verification

Purpose: review and approve hotel partner applications.

Main sections:

- Partner applications queue
- Partner profile
- Business details
- Document checklist
- Property preview
- Risk and compliance score
- Internal note
- Activity timeline
- Decision buttons

Primary actions:

- Review
- Approve Partner
- Request Changes
- Reject

Responsible UX:

- Approve and reject must be clearly separated.
- Request changes should be easier than rejection.
- Show document status before decision buttons.

### Bookings Management

Purpose: manage reservations, changes, refunds, cancellations, and support context.

Main sections:

- Booking KPIs
- Advanced filters
- Booking status tabs
- Booking table
- Booking detail inspector
- Payment summary
- Guest requests
- Activity log

Primary actions:

- View Invoice
- Modify Booking
- Issue Refund
- Cancel Booking

Responsible UX:

- Refund and cancellation actions require confirmation.
- Display policy and payment status before financial action.

### Hotels & Properties

Purpose: manage property listings, quality, safety, availability, and approval states.

Main sections:

- Hotel KPIs
- Property filters
- Property table
- Selected property inspector
- Listing quality checklist
- Recent changes pending approval
- Safety docs
- Audit log

Primary actions:

- Preview Listing
- Request Changes
- Approve Updates
- Temporarily Pause Listing

Responsible UX:

- Pause listing must show booking impact warning.
- Changes to live listings should have an audit log.

### Users & Customers

Purpose: manage customer accounts, loyalty, bookings, support, and trust signals.

Main sections:

- Customer KPIs
- User filters
- User table
- Customer profile inspector
- Upcoming booking
- Recent bookings
- Support history
- Trust and safety score
- Sensitive account actions

Primary actions:

- View Profile
- Send Message
- Create Ticket
- View Bookings

Sensitive actions:

- Lock Account
- Reset Password Link
- Remove Saved Payment
- Escalate Review

Responsible UX:

- Do not expose account deletion as a casual action.
- Keep sensitive actions separated and logged.

### Payments & Refunds

Purpose: track money movement, partner payouts, commissions, refunds, disputes, and transaction history.

Main sections:

- Gross Booking Value
- Net Revenue
- Partner Payouts Due
- Refund Requests
- Disputes Open
- Transaction ledger
- Payment/refund inspector
- Payout breakdown
- Refund eligibility
- Risk check
- Audit trail

Primary actions:

- View Invoice
- Download Receipt
- Contact Guest
- Contact Partner
- Approve Partial Refund
- Request Finance Review
- Decline Refund

Responsible UX:

- Never make full refund one-click.
- Show refund eligibility and policy before approval.
- Show commission and payout impact before saving.

### Reviews & Moderation

Purpose: protect review trust, monitor guest feedback, and moderate fairly.

Main sections:

- Average rating
- Review volume
- Flagged reviews
- Pending hotel replies
- Response rate
- Rating distribution
- Sentiment summary
- Review queue
- Selected review inspector
- Hotel reply preview
- Moderation checks
- Audit log

Primary actions:

- Publish Review
- Request Hotel Reply
- Message Guest
- View Booking

Sensitive actions:

- Hide Review
- Escalate to Trust Team
- Mark as Disputed

Responsible UX:

- Do not include delete review as a primary action.
- Moderation decisions require reason and audit trail.

### Support & Tickets

Purpose: handle customer and partner issues with context and SLA clarity.

Main sections:

- Open Tickets
- Urgent SLA
- Average Response Time
- Resolved Today
- Customer Satisfaction
- Ticket queue
- Conversation panel
- Customer context
- Booking context
- Refund eligibility
- Escalation actions
- Audit log

Primary actions:

- Reply
- Assign Ticket
- Add Internal Note
- Contact Partner

Sensitive actions:

- Issue Refund
- Cancel Booking
- Override Policy

Responsible UX:

- Show booking and refund context before sensitive action.
- Use SLA timers clearly.
- Keep internal notes visually distinct from customer replies.

## 9. Partner Dashboard Pages

### Partner Overview

Purpose: give hotel partners a daily command center.

Main sections:

- Property switcher
- Welcome card
- Listing health
- Arrivals Today
- Departures Today
- Occupancy
- Revenue This Week
- Pending Requests
- Revenue and occupancy chart
- Today’s operations checklist
- Action center
- Upcoming reservations
- Room availability
- Review summary
- Payout summary

Primary actions:

- Update Availability
- Add Room
- View Public Listing
- Respond to Reviews
- View Payouts

UX notes:

- Show what needs attention today.
- Keep actions near the related data.
- Use friendly microcopy.

### Partner Reservations

Purpose: manage arrivals, departures, guest requests, and booking changes.

Main sections:

- Arrival/departure snapshot
- Reservation filters
- Reservation table
- Selected reservation inspector
- Guest profile
- Stay timeline
- Room assignment
- Payment summary
- Guest requests
- Pre-arrival checklist
- Quick communication
- 7-day arrival and capacity overview

Primary actions:

- Mark Checked In
- Update Room
- Send Message
- Print Confirmation

Sensitive actions:

- Cancel Reservation
- Mark No-show
- Modify Dates
- Request Refund Review

Responsible UX:

- Actions affecting guest booking require confirmation.
- Room assignment should show readiness state.

### Partner Rooms & Rates

Purpose: manage pricing, availability, inventory, and restrictions.

Main sections:

- Available rooms
- Average daily rate
- Occupancy forecast
- Revenue opportunity
- Low availability dates
- Inventory calendar
- Room type rows
- Selected room inspector
- Rate insight
- Change preview
- Sync status
- Audit log

Primary actions:

- Add Room Type
- Bulk Update Rates
- Sync Channel Calendar
- Save Changes
- Preview Public Rate

Sensitive actions:

- Close Room Type
- Mark Sold Out
- Bulk Override Dates

Responsible UX:

- Bulk changes require preview before save.
- Show revenue, occupancy, and ADR impact before applying.
- Show last synced status.

### Partner Property Listing Editor

Purpose: help partners maintain a complete, accurate, guest-ready listing.

Main sections:

- Listing health score
- Completion progress
- Autosave status
- Pending changes
- Section navigation
- Photos and gallery editor
- Public listing preview
- Listing quality checklist
- Improvement suggestions
- Change summary
- Version history
- Activity log

Primary actions:

- Save Draft
- Preview Listing
- Submit for Review

Sensitive actions:

- Unpublish Listing
- Delete Photo from Live Listing

Responsible UX:

- Do not instant-publish major changes.
- Use `Submit for Review` for changes that affect guest trust.
- Make draft vs live state obvious.

### Partner Reviews & Guest Feedback

Purpose: help partners reply professionally and improve guest experience.

Main sections:

- Average rating
- New reviews
- Awaiting reply
- Sentiment summary
- Rating trend
- Top feedback topics
- Review queue
- Selected review detail
- Reply composer
- Improvement tasks
- Reputation overview
- Safe dispute actions

Primary actions:

- Respond to Latest
- Save Draft
- Submit Reply
- View Public Reviews

Sensitive actions:

- Flag Review
- Dispute Review
- Report Abuse

Responsible UX:

- Avoid manipulative review controls.
- Replies should be tone-safe and guest-friendly.
- Dispute actions require reason.

## 10. Data Display Rules

### Dates

Use readable date formats:

- `May 20, 2025`
- `May 20 - May 24, 2025`
- `Today, 10:24 AM`

Avoid ambiguous dates like `05/20/25` in admin-critical flows.

### Money

Use clear formatting:

- `$495 / night`
- `$1,240.00`
- `USD 385`

Show payment breakdowns for:

- Guest payment
- Taxes and fees
- Platform commission
- Partner payout
- Refund amount

### Ratings

Use champagne stars.

Display:

- Numeric score
- Star visual
- Review count when available

Example:

`4.8 ★ (1,248 reviews)`

### Percentages

Use percentages for:

- Occupancy
- Response rate
- Quality score
- Trust score
- Sentiment

Always label what the percentage means.

## 11. Iconography

Use simple line icons with rounded strokes.

Recommended icon style:

- Stroke width: `1.75px` to `2px`
- Rounded caps and joins
- Minimal detail

Use icons for:

- Navigation
- KPI cards
- Status labels
- Quick actions
- Empty states

Avoid overly playful icons in admin screens.

## 12. Motion And Interaction

Use motion lightly.

Recommended:

- Page fade and slide up on load: `180ms`
- Card hover lift: `120ms`
- Drawer/inspector transition: `220ms`
- Button press scale: `0.98`
- Toast slide-in: `200ms`

Avoid:

- Bouncy animations
- Excessive loading spinners
- Decorative motion on dense dashboards

## 13. Responsive Behavior

### Desktop

Use full sidebar and multi-column layouts.

### Tablet

- Collapse sidebar to icon rail.
- Move inspector panel below table or into drawer.
- Keep filters scrollable horizontally.

### Mobile

- Use bottom navigation for partner dashboard if needed.
- Use card lists instead of tables.
- Open inspectors as full-screen sheets.
- Keep dangerous actions below normal actions.

## 14. Accessibility

Minimum rules:

- Text contrast must meet WCAG AA.
- Do not rely on color alone for status.
- Every icon-only button needs a label.
- Focus states must be visible.
- Tables need readable row spacing.
- Inputs need labels, not only placeholders.
- Error messages should explain the fix.

Focus ring:

```css
outline: 2px solid #d8b46a;
outline-offset: 2px;
```

## 15. Implementation Tokens

Use these tokens in CSS/Tailwind config or a theme object.

```ts
export const helpkeyDashboardTheme = {
  colors: {
    navy950: "#06142B",
    navy900: "#0A1F3C",
    navy800: "#102B52",
    gold500: "#D8B46A",
    gold600: "#C6973E",
    gold100: "#FBF3DF",
    ivory50: "#F7F4EE",
    white: "#FFFFFF",
    ink: "#111827",
    muted: "#6B7280",
    border: "#E6E2DA",
    success: "#0F8A5F",
    successBg: "#EAF7F1",
    warning: "#F2A900",
    warningBg: "#FFF6DB",
    danger: "#D92D20",
    dangerBg: "#FEECEC",
    info: "#2563EB",
    infoBg: "#EAF1FF",
  },
  radius: {
    sm: "8px",
    md: "12px",
    lg: "18px",
    xl: "24px",
    pill: "999px",
  },
  shadow: {
    card: "0 12px 30px rgba(6, 20, 43, 0.06)",
    elevated: "0 18px 45px rgba(6, 20, 43, 0.12)",
    navy: "0 16px 36px rgba(6, 20, 43, 0.22)",
  },
  spacing: {
    pageX: "32px",
    pageY: "24px",
    gridGap: "24px",
    cardPadding: "20px",
  },
};
```

## 16. Recommended Next.js Structure

Use route groups to separate dashboard areas.

```txt
app/
  (dashboard)/
    admin/
      layout.tsx
      page.tsx
      partners/page.tsx
      bookings/page.tsx
      hotels/page.tsx
      users/page.tsx
      payments/page.tsx
      reviews/page.tsx
      support/page.tsx
    partner/
      layout.tsx
      page.tsx
      reservations/page.tsx
      rooms-rates/page.tsx
      property-listing/page.tsx
      reviews/page.tsx
      payouts/page.tsx
      messages/page.tsx
components/
  dashboard/
    DashboardShell.tsx
    Sidebar.tsx
    Topbar.tsx
    KpiCard.tsx
    DataTable.tsx
    StatusChip.tsx
    InspectorPanel.tsx
    SensitiveActions.tsx
    AuditLog.tsx
    FilterBar.tsx
    EmptyState.tsx
lib/
  theme/
    dashboard-theme.ts
```

## 17. Build Quality Checklist

Before finalizing each page, check:

- Sidebar active state is correct.
- Page title and subtitle explain the page.
- Top KPIs are relevant to the page.
- Filters match the data shown.
- Tables are readable and not cramped.
- Selected row/card has a visible state.
- Inspector panel gives enough context before actions.
- Sensitive actions are separated and labeled.
- Notes and audit logs exist for high-risk workflows.
- Empty, loading, and error states are designed.
- Mobile/tablet behavior is planned.

## 18. Overall Feeling

The finished dashboard should feel like:

> A premium hotel operations platform that teams can trust with bookings, money, guests, partners, listings, and reviews.

It should not feel like:

- A generic admin template
- A dark crypto dashboard
- A playful travel app
- A copied Airbnb or Booking.com interface
- A table-heavy spreadsheet with buttons

Keep it refined, calm, safe, and useful.
