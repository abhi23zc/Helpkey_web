# Customer search rollout

Search cards describe one eligible room/rate offer. Price, room amenities, beds,
breakfast and cancellation must come from that offer. Missing information is
omitted. Hotel stars and certification badges are not inferred from guest reviews.

## Cache and cost

The shared search service is used by SSR and the search API. Ordered, filtered
results are cached independently of page size/cursor for at most 30 seconds,
shortened by the selected offers' cancellation or advance-booking deadlines.
Expired prices are never served as an error fallback. Booking creation always
rechecks the authoritative rate, policy, capacity and inventory transactionally.

Candidate scanning remains capped at 1,000 hotels. Broader searches return a
request to narrow the destination/property type rather than incomplete counts or
incorrect global ordering. Cold searches still evaluate candidates; repeat pages
and identical searches reuse the evaluation. Redis failure falls back to direct
calculation. Changed/expired cursors ask the customer to restart results.

Logs: `search.evaluate` records candidates, results, fallback count and duration;
`search.source_read` records batched document volumes; `search.snapshot` records
cache hits/misses and evaluation payload size. Existing `api.request` telemetry
records request timing, Redis activity and response bytes. Measure cold and warm
searches separately; query-call counts are not equivalent to billable documents.

## Deployment

1. Deploy the compatible web code and projection workers together. Existing data
   remains readable through legacy fallbacks.
2. Rebuild search projections with `npm run projection:backfill -- --restart`.
   Verify afterwards with `npm run projection:backfill -- --verify`.
   Projection version 3 adds property-only amenity summaries and stops inferring
   free cancellation from the existence of a policy.
3. Existing rates default to no breakfast inclusion claim. Partners explicitly
   enable breakfast in the rate editor. No bulk breakfast migration is required.
4. Use the existing rate-plan `(propertyId, status)` index in
   `firestore.indexes.json`. Wishlist pagination uses document-ID order and needs
   no new composite index. Existing deny-by-default Firestore rules apply;
   wishlist access is through authenticated server endpoints only.
5. Configure Redis for shared reuse and the existing
   `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` for real maps. Optional
   `NEXT_PUBLIC_GOOGLE_MAP_ID` overrides the default map ID. Restrict the browser
   key to the deployed origins. Maps loads only when opened; list booking works
   if Maps is unavailable.

No deployment, backfill or live database migration is performed by implementing
this code change.

## Interfaces

The web search opts into `includeClientSnapshot=true`. For complete searches of
at most 100 eligible hotels and 256 KiB of serialized snapshot data, the response
also contains a versioned `clientSnapshot` with public hotel fields and every
eligible room/rate offer. SSR requests the same snapshot. This is the complete
candidate set before rating, amenity, cancellation, price and sort filters, even
when the landing URL is filtered or the displayed page is small.

The browser and server share the same result-selection and sorting functions.
Fresh complete snapshots support local filtering, clearing, sorting, exact
counts, facets and pagination without another search request. The price slider
also updates locally; server searches retain a debounce. Incomplete, oversized,
expired or mismatched snapshots use the normal server search. Snapshots remain
in memory and never extend the server's 30-second or earlier offer deadline.
Booking still performs authoritative server validation.

Requests that take more than 120 ms show full hotel-card skeletons over the
reserved result area, with stale cards hidden and inert until completion.
Fast local changes do not flash loading placeholders. The previous small
loading strip is removed; reduced-motion preferences are respected.

`GET /api/search/properties` accepts repeated `propertyType` and `amenity`
parameters plus `minRating`, price bounds, and `freeCancellation=true`. It returns
exact `total`, `evaluatedAt`, `expiresAt`, amenity facets and a selected public
`offer` on dated hotel cards. Existing price fields remain compatible.

Authenticated wishlist routes:
- `GET /api/wishlist?limit=24&cursor=…`: paginated public saved hotels; unavailable
  hotels return `property: null`.
- `GET /api/wishlist?ids=true&propertyId=…`: saved state for up to 50 visible IDs.
- `PUT /api/wishlist/[propertyId]`: idempotently save an active public hotel.
- `DELETE /api/wishlist/[propertyId]`: idempotently remove the caller's saved hotel.

Saved records live at `users/{uid}/savedProperties/{propertyId}`. The server derives
`uid` from authentication. Saves require sign-in and resume after successful login;
cancelling login abandons the pending save. Optimistic updates roll back on error,
and account-specific caches are cleared on sign-out/account switch.
