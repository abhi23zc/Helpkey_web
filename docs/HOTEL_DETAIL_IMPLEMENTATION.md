# Hotel details implementation

The hotel page uses stored descriptions, property-only facilities, room-specific amenities, normalized guest rules, full addresses, local arrival/departure times, and published photos. Missing or broken photos use `public/photo-unavailable.svg`; room photos never fall back to property covers. The preview contains at most five photos and the dialog includes the full published gallery.

Share uses a public hotel URL with no query parameters. Native sharing falls back to the clipboard, with accessible feedback. Wishlist reads remain independent. Maps import their library only after Show map. Reviews load near the viewport or on opening, use cursor-based infinite queries, preview two records, and retain every loaded record in the drawer. Both dialogs contain keyboard focus, support Escape, lock scrolling, and restore focus.

## Availability and booking

`availableOffers` shares `evaluateStay` and inventory capacity rules with authoritative checkout. `loadBookableProperty` loads property, rooms, rates, policies and room covers once; all rates reuse one deduplicated inventory snapshot. Additive rate fields include subtotal, taxes, fees, total, payable-now amount, balance, stay timestamps, duration/nights and expiry. Currency displays preserve paise, including checkout.

Server hydration, HTTP requests and client queries share normalized stay defaults. Request-scoped React caching also shares property, room and rate reads between detail and offer prefetches in the same server render. Hotel offers reuse the search generation cache, distributed coordination and process-level request deduplication. Snapshots expire within 30 seconds and sooner at arrival or cancellation cutoffs. Infrastructure failures are never cached or substituted for sold-out responses. Partner changes invalidate the affected property and offer generations.

An expiry timer disables old offers; the next interaction or return to the tab refreshes silently. There is no periodic availability polling. Last successful rooms remain visible during refresh and after errors, but cannot be reserved until fresh results match the stay. Changed or missing selected offers require explicit review. Selection persists in the URL; native history updates avoid repeated server prefetches during local edits. Checkout remains authoritative and guards against expired links at activation.

Guest controls use search limits independently of the selected room. Apply commits guest edits once. Date edits commit a complete valid range; hourly edits debounce for 350ms. Availability and booking enforce adult, child, infant and combined adult/child occupancy limits using the existing domain semantics.

## Guest policies

`guestPoliciesSchema` is shared across onboarding, dashboard editing and public normalization. Children, pets, smoking and government-ID choices support unspecified values. Minimum age is optional, integer 18–100; additional rules are limited to 2,000 characters. Amenities saves update amenities only. Existing policies are not backfilled or invented.

An explicit children-not-allowed rule rejects children and infants in shared availability and authoritative booking evaluation. Public DTOs allowlist normalized fields; owner, KYC and onboarding fields remain private. The hotel booking panel and checkout show the configured rules without claiming automatic age or identity verification.

## Verification

- `npm test`: unit/service regressions, including pricing parity, paise/deposits, guest policies, public isolation, occupancy, hourly boundaries, cache deadlines, invalidation and deduplicated reads.
- `npm run test:e2e:hotel`: isolated browser harness using real hotel and policy-editor components, with routing/auth boundaries and HTTP fixtures. It exercises sharing, persisted saves, galleries, lazy maps/reviews, complete pagination, guest/date/hourly edits, stale/changed offers, checkout links, policy saves, error states and desktop/mobile overflow. It does not access live data.
- `npm run typecheck` and `npm run lint`.
- `npx next build --webpack`: production compilation, typecheck, static generation and tracing. Default Turbopack builds encounter an environment worker-port restriction here, including after escalation.

The same two-rate/two-night service fixture reads nine source documents cold (five collection documents, one cover and three unique inventory calendars), and zero on a warm cache hit. Generation changes and hard expiry force fresh reads. `hotel.availability`, `offers.evaluate`, and `search.snapshot` log duration, source read counts, evaluated offers and cache outcomes without customer data. These fixture results are not a live database latency benchmark; amenity catalog metadata is outside the offer-source counts.

Database-emulator, external queue and payment-sandbox suites require their existing isolated services and credentials. Deployment, live data changes and production latency measurements remain separate.

## Verified results

The implementation passed 189 unit/service tests, 10 isolated hotel browser tests and six existing search browser tests. Typecheck, production Webpack build and whitespace checks passed. Lint reported no errors and 61 existing workspace warnings. Forty environment-dependent unit/integration checks were skipped; the existing end-to-end hourly checkout test additionally needs the Firestore emulator. The isolated hotel suite verifies hourly controls and checkout context without invoking payment providers.

Desktop and mobile screenshots were inspected, including missing-photo states, responsive gallery layout and booking controls. Keyboard containment and restoration were checked in the gallery and review drawer; mobile document overflow was checked at 390px.

## Changed-offer warning correction

Offer selection and accepted-price comparisons are scoped to the normalized stay. Editing dates, guests, duration or booking mode clears the previous selection and comparison price. The header stay-type toggle follows the same rule. Comparisons wait for successful, fresh availability rather than treating loading, expired snapshots or failed refreshes as changed offers.

The additive `ratePlanModes` availability field contains public rate IDs and their booking modes only. This lets existing URLs containing an overnight rate alongside an hourly stay start a new selection without a misleading changed-offer warning. Missing offers within the same booking mode and genuine price changes still require review. The hotel snapshot namespace is versioned to avoid reusing responses without this metadata.

Follow-up verification: 16 targeted contract/service tests and 13 hotel browser checks, plus typecheck and targeted lint. Regressions cover header and booking-panel mode switches, guest edits, old hourly URLs, loading states and genuine price changes.
