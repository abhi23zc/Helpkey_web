# Hotel page performance

## Behavior and data flow

The hotel header and booking panel share `useHotelStay`. Inputs update immediately. Valid edits update the URL with native `replaceState`, without running the hotel server page again. Mode changes request availability immediately; guests and hourly fields debounce for 300 ms. Incomplete overnight ranges remain local and cannot reserve. Browser history restores inputs and cancels pending work. The guest picker and keyboard focus survive responses.

Property content uses the same generation-invalidated Redis loader on the server page and property API. The page hydrates property content without waiting for availability. Room inventory is fetched independently through React Query. A query key includes the complete normalized stay; obsolete requests are aborted and late results cannot become active. Same-stay fresh responses can be reused when switching back.

The booking heading shows “Checking price…” while the draft/request is pending; room cards use localized price skeletons. Room descriptions stay visible. Old price signatures are cleared when the stay changes, while compatible room preferences survive guest/date edits. Failed requests offer retry. Expired results offer refresh rather than polling. Changed prices for the same stay still require review, and checkout remains authoritative.

## Expiry and API compatibility

`/api/properties/[slug]/bookable` adds response-time `serverNow` outside the cached payload. Existing URL fields, API envelopes, price calculations, and inventory rules remain compatible. Room image fields now reach the UI through a shared availability type.

Availability gets one receipt-relative deadline, capped at 30 seconds and reduced by request elapsed time. Both monotonic and wall-clock deadlines must remain valid, preventing clock rollback or device sleep from extending an offer. Cache reuse never renews the deadline. One expiry timer marks a response expired; changing expiry state does not restart the timer. Generic page-wide key/pointer refresh listeners have been removed. Tab return and explicit refresh recover expired results, with request deduplication.

## Assets and rendering

Gallery, overview, policies, reviews, and location have memoized boundaries. Login and fullscreen gallery code load on demand. The gallery image has high fetch priority; gallery and room images use responsive variants. Fullscreen viewing preloads adjacent photos only. Maps still load on click and reviews near the viewport. Plus Jakarta Sans uses `next/font` self-hosting rather than a browser-time Google CSS import.

## Verification

Commands:

```sh
npm run test -- --silent
npm run typecheck
npm run test:e2e:hotel
npm run test:e2e:hotel-next
npm run build -- --webpack
```

- Unit suite: 236 passed; 40 external-service tests skipped.
- Hotel browser suite: 15 passed. Includes rapid combined guest edits, preserved picker/focus, errors, expiry with a further idle minute, explicit refresh, stale responses, fresh-cache reuse, mode changes, incomplete dates, checkout context, gallery containment, and mobile layout.
- Production Next router: desktop and 390px mobile with 4× CPU throttling passed. No hotel document/RSC navigations or property refetches occurred during edits. History restoration passed. The fixture builds the real hotel components/providers with Next.js and mocks public HTTP responses; it does not import server database services.
- Typecheck and lint for the changed hotel paths passed. Full repository lint is blocked by existing `react-hooks/set-state-in-effect` errors in `components/booking/booking-checkout.tsx:306` and `components/search/search-map.tsx:80`, plus existing warnings. These unrelated edits were preserved.
- Application production build passed with webpack. Default Turbopack compilation failed in this environment because a compilation worker could not bind a port, including on an escalated attempt.

Latest production-fixture samples (four measured clicks per device):

| Measurement | Desktop | Mobile, 4× CPU |
| --- | --- | --- |
| Click-to-two-animation-frames proxy | 16.5–32.1 ms | 49.1–110.3 ms |
| LCP | 732 ms | 1,408 ms |
| CLS | 0 | 0.0935 |

Metrics and full-page screenshots are saved under `test-results/hotel-next/` by `test:e2e:hotel-next`. These are controlled fixture measurements with mocked hotel data and fallback photos, not field INP or live Firestore/CDN measurements. There is no valid before/after timing baseline for the live hotel: its localhost server/browser was unavailable during the initial audit. Cold/warm availability timings and source read counts remain available through existing `hotel.availability` and `search.snapshot` logs; validate real network latency and field Web Vitals after deployment.
