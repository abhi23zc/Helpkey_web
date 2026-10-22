# Firestore index audit — Helpkey

## Additive deployment update

Final verification: all **64 live indexes are READY**, including all nine additions. All **88/88 audited query shapes** plan successfully with **zero errors**, resolving the original 13 failures. These are planner checks, not end-to-end production transactions. No cleanup candidates were removed.

The nine missing indexes were submitted to project `helpkey-a8fab` on 2026-10-21 using the signed-in Firebase CLI account. No existing indexes were deleted or updated. The configured service account can audit indexes but its creation request was denied, so it was not used for deployment. The active manifest now includes the five newly identified definitions, preserving all previous entries (63 local definitions). The original audit below is the pre-deployment baseline; see `firestore-index-audit-after-additions.json` for follow-up verification.

Audit timestamp: 2026-10-21T08:05:08.787Z. Project: `helpkey-a8fab`, database `(default)`.

This audit read index metadata and ran 88 Query Explain requests with analyze=false. It did not execute result queries, modify documents, or create/delete indexes. The repository source was inspected separately. Query Explain default mode charges one read per request, so the planner portion used 88 read operations.

## Result

| Finding | Count |
| --- | ---: |
| Deployed composite indexes (all READY) | 55 |
| Local manifest definitions | 58 |
| Unique local definitions after implicit __name__ normalization | 57 |
| Query shapes checked | 88 |
| Query shapes with working plans | 75 |
| Query shapes failing with no matching index | 13 |
| Deployed cleanup candidates without a current repository query | 12 |
| Additional overlapping city/price index candidate | 1 |
| Missing physical index definitions to add | 9 |
| Recommended final composite indexes | 51 |

The 51-index manifest is a review artifact: `docs/firestore.indexes.recommended.json`. The active `firestore.indexes.json` and live indexes were deliberately left unchanged. This is a repository/query-plan audit, not historical per-index traffic telemetry. Other deployed backends, older application versions, or manual queries outside this repository must be checked before deleting candidates.

## Missing coverage to fix before cleanup

Four worker indexes already exist locally but are not deployed: projectionOutbox(recoverable,nextRecoveryAt), mediaPublicationOutbox(recoverable,nextRecoveryAt), refunds(status,nextAttemptAt), and bookingNotificationOutbox(status,nextAttemptAt). Their four audited queries currently fail in the cloud.

Four new properties indexes are needed for ratingAverage ASC: the public-visibility equality fields plus ratingAverage; the same plus normalizedCity; the same plus propertyType; and the same plus amenityCodes ARRAY_CONTAINS. These cover eight failing combinations through index merging, matching the existing DESC strategy. This is an unbuilt proposed coverage set and must be verified after creation.

One new bookings(propertyId ASC, checkIn ASC) index is needed for the projection dashboard upcoming-reservation count. A DESC checkIn index does not satisfy this default ASC range query; the live planner confirmed the failure.

No live index additions were made. The recommendation contains all nine additions: the four undeployed worker indexes and five new definitions.

## Complete local manifest review

Numbers refer to the original 58-entry active manifest captured in the audit JSON. ASC/DESC directions matter; only the standard implicit trailing __name__ direction was normalized.

| # | Collection | Fields | Classification | Evidence / action |
| ---: | --- | --- | --- | --- |
| 1 | properties | status ASC, isBookable ASC, address.city ASC, minimumDisplayPricePaise ASC | Cleanup candidate | Legacy property search uses address.city/minimumDisplayPricePaise. Current queries use normalizedCity/minimumPricePaise. |
| 2 | roomTypes | propertyId ASC, status ASC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 3 | ratePlans | propertyId ASC, status ASC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 4 | notifications | userId ASC, readAt ASC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 5 | propertyReviews | propertyId ASC, status ASC, submittedAt DESC | Duplicate local definition | Same physical index as #23: Firestore supplies __name__ DESC implicitly. Removing this JSON entry does not itself delete a second cloud index. |
| 6 | mediaPublicationJobs | status ASC, leaseExpiresAt ASC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 7 | aadhaarVerificationLab | operatorId ASC, createdAt DESC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 8 | aadhaarVerificationLab | operatorId ASC, createdAt ASC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 9 | aadhaarVerificationLab | aadhaarFingerprint ASC, createdAt ASC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 10 | properties | status ASC, approvalStatus ASC, isBookable ASC, normalizedCity ASC, __name__ ASC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 11 | properties | status ASC, approvalStatus ASC, isBookable ASC, normalizedName ASC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 12 | bookings | guestId ASC, checkIn DESC, __name__ DESC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 13 | bookings | guestId ASC, propertyId ASC, bookingStatus ASC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 14 | bookings | propertyId ASC, checkIn DESC, __name__ DESC | Cleanup candidate | Partner bookings now filter by propertyId and sort in memory. Upcoming-count query needs checkIn ASC, not this DESC index. |
| 15 | bookings | propertyId ASC, checkOut ASC | Cleanup candidate | No current checkOut filter or ordering found. |
| 16 | bookings | propertyId ASC, bookingStatus ASC, checkIn DESC, __name__ DESC | Cleanup candidate | No current propertyId + bookingStatus + checkIn ordering query found. |
| 17 | bookings | bookingStatus ASC, createdAt DESC, __name__ DESC | Cleanup candidate | Admin bookings now sort createdAt in memory, not Firestore. |
| 18 | notifications | userId ASC, createdAt DESC, __name__ DESC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 19 | notifications | userId ASC, readAt ASC, createdAt DESC, __name__ DESC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 20 | propertyMemberships | userId ASC, status ASC, propertyId ASC | Cleanup candidate | No current membership query orders or filters by propertyId after userId/status; planner merges single-field indexes. |
| 21 | propertyDailyMetrics | propertyId ASC, date DESC | Cleanup candidate | Metrics are written but no current query orders propertyDailyMetrics by date. |
| 22 | roomNightInventory | propertyId ASC, roomTypeId ASC, date ASC | Cleanup candidate | Legacy inventory capacity checks use propertyId/roomTypeId only; keep the two-field index (#49). |
| 23 | propertyReviews | propertyId ASC, status ASC, submittedAt DESC, __name__ DESC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 24 | users | roles ARRAY, accountStatus ASC, isActive ASC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 25 | properties | searchTokens ARRAY, approvalStatus ASC, status ASC, __name__ ASC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 26 | bookings | propertyId ASC, searchTokens ARRAY, checkIn DESC, __name__ DESC | Cleanup candidate | Partner booking search now filters in memory; no propertyId/searchTokens/checkIn query remains. |
| 27 | bookings | bookingStatus ASC, searchTokens ARRAY, createdAt DESC, __name__ DESC | Cleanup candidate | Admin booking search no longer orders by createdAt in Firestore; keep the status/searchTokens index (#51). |
| 28 | propertyReviews | propertyId ASC, status ASC, replyState ASC, submittedAt DESC, __name__ DESC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 29 | propertyReviews | propertyId ASC, status ASC, sentiment ASC, submittedAt DESC, __name__ DESC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 30 | propertyReviewEvents | propertyId ASC, createdAt DESC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 31 | properties | status ASC, approvalStatus ASC, isBookable ASC, ratingAverage DESC, __name__ DESC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 32 | properties | status ASC, approvalStatus ASC, isBookable ASC, normalizedCity ASC, ratingAverage DESC, __name__ DESC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 33 | properties | status ASC, approvalStatus ASC, isBookable ASC, propertyType ASC, ratingAverage DESC, __name__ DESC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 34 | properties | status ASC, approvalStatus ASC, isBookable ASC, normalizedCity ASC, propertyType ASC, ratingAverage DESC, __name__ DESC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 35 | properties | status ASC, approvalStatus ASC, isBookable ASC, normalizedCity ASC, minimumPricePaise ASC, __name__ ASC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 36 | properties | status ASC, approvalStatus ASC, isBookable ASC, propertyType ASC, minimumPricePaise ASC, __name__ ASC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 37 | properties | status ASC, approvalStatus ASC, isBookable ASC, minimumPricePaise ASC, __name__ ASC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 38 | properties | status ASC, approvalStatus ASC, isBookable ASC, minimumPricePaise DESC, __name__ DESC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 39 | properties | status ASC, approvalStatus ASC, isBookable ASC, amenityCodes ARRAY, minimumPricePaise ASC, __name__ ASC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 40 | properties | status ASC, approvalStatus ASC, isBookable ASC, amenityCodes ARRAY, ratingAverage DESC, __name__ DESC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 41 | properties | status ASC, approvalStatus ASC, isBookable ASC, normalizedCity ASC, minimumPricePaise DESC, __name__ DESC | Overlapping cloud definition | Planner uses alternate equality-prefix ordering CICAgJjmiJEJ. Retain that existing definition in the recommended manifest and remove CICAgJjUgIcK only after verification. |
| 42 | properties | status ASC, approvalStatus ASC, isBookable ASC, propertyType ASC, minimumPricePaise DESC, __name__ DESC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 43 | properties | status ASC, approvalStatus ASC, isBookable ASC, amenityCodes ARRAY, minimumPricePaise DESC, __name__ DESC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 44 | bookings | bookingStatus ASC, expiresAt ASC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 45 | bookings | paymentReconciliationPending ASC, nextReconcileAt ASC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 46 | refunds | status ASC, updatedAt ASC | Cleanup candidate | Refund polling now uses nextAttemptAt; status/updatedAt is the old polling query. |
| 47 | propertyMemberships | propertyId ASC, status ASC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 48 | inventoryCalendars | propertyId ASC, roomTypeId ASC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 49 | roomNightInventory | propertyId ASC, roomTypeId ASC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 50 | inventoryBlocks | propertyId ASC, roomTypeId ASC, status ASC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 51 | bookings | bookingStatus ASC, searchTokens ARRAY | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 52 | properties | status ASC, approvalStatus ASC, isBookable ASC, __name__ ASC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 53 | properties | status ASC, approvalStatus ASC, isBookable ASC, propertyType ASC, __name__ ASC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 54 | properties | status ASC, approvalStatus ASC, isBookable ASC, normalizedCity ASC, propertyType ASC, __name__ ASC | Keep | Matches current query coverage / selected planner index. Includes compatibility operations and infrequent maintenance. |
| 55 | projectionOutbox | recoverable ASC, nextRecoveryAt ASC | Keep; missing in cloud | Required by new worker recovery/due-time queries; matching live Explain request fails. |
| 56 | mediaPublicationOutbox | recoverable ASC, nextRecoveryAt ASC | Keep; missing in cloud | Required by new worker recovery/due-time queries; matching live Explain request fails. |
| 57 | refunds | status ASC, nextAttemptAt ASC | Keep; missing in cloud | Required by new worker recovery/due-time queries; matching live Explain request fails. |
| 58 | bookingNotificationOutbox | status ASC, nextAttemptAt ASC | Keep; missing in cloud | Required by new worker recovery/due-time queries; matching live Explain request fails. |

## Deployed cleanup candidates

These 12 have no matching current repository query, and none was selected by the audited query plans. Absence from this sample alone is not proof of zero historical usage.

| Local # | Collection | Cloud index ID | Reason |
| ---: | --- | --- | --- |
| 1 | properties | CICAgLiIkYMK | Legacy property search uses address.city/minimumDisplayPricePaise. Current queries use normalizedCity/minimumPricePaise. |
| 14 | bookings | CICAgLiT_JAK | Partner bookings now filter by propertyId and sort in memory. Upcoming-count query needs checkIn ASC, not this DESC index. |
| 15 | bookings | CICAgNi4t5oK | No current checkOut filter or ordering found. |
| 16 | bookings | CICAgPi9lIEK | No current propertyId + bookingStatus + checkIn ordering query found. |
| 17 | bookings | CICAgNirtJAK | Admin bookings now sort createdAt in memory, not Firestore. |
| 20 | propertyMemberships | CICAgLiIjZIK | No current membership query orders or filters by propertyId after userId/status; planner merges single-field indexes. |
| 21 | propertyDailyMetrics | CICAgPiftYMK | Metrics are written but no current query orders propertyDailyMetrics by date. |
| 22 | roomNightInventory | CICAgPi9ipAK | Legacy inventory capacity checks use propertyId/roomTypeId only; keep the two-field index (#49). |
| 26 | bookings | CICAgLiI64sK | Partner booking search now filters in memory; no propertyId/searchTokens/checkIn query remains. |
| 27 | bookings | CICAgJiU25oK | Admin booking search no longer orders by createdAt in Firestore; keep the status/searchTokens index (#51). |
| 46 | refunds | CICAgPif34sK | Refund polling now uses nextAttemptAt; status/updatedAt is the old polling query. |
| Cloud only | bookings | CICAgNi4-ZIK | hotelAdmin ASC / createdAt DESC: hotelAdmin is not used by any current repository query. |

The additional overlap candidate is `properties/CICAgJjUgIcK` (local #41). Keep `properties/CICAgJjmiJEJ`, which was actually selected for city + descending-price queries. They differ in the ordering of fields that are equality-constrained in these queries. They are not treated as universally interchangeable for arbitrary future queries.

## Important distinctions

- #5 and #23 are two local descriptions of ONE deployed index, CICAgLjRyYIK. Do not delete that live index; it supports public/partner review ordering.
- Keep all three Aadhaar lab indexes: DESC supports listing; ASC supports rate-limit time ranges. Opposite directions are not automatically redundant.
- Keep both notification list indexes and the user/readAt count index; each was selected for a current query.
- Keep search and amenity variants even if rarely used. Explain selected multiple indexes together for city/type/amenity combinations; removing one can break a combined filter.
- Keep the legacy media lease recovery and two-field roomNightInventory compatibility indexes while those supported code paths remain.
- Direct document reads by ID do not need composite indexes. Reading a field in a DTO or sorting records in JavaScript does not justify a Firestore composite index.

## Safe rollout

1. Back up the captured live definitions (`docs/firestore-index-audit.json`) and confirm no other client/backend relies on cleanup candidates.
2. Add only the nine missing definitions. Do not delete extra indexes during this deployment. Wait for every new index to become READY.
3. Rerun the 88 planner checks and exercise search filters, rating ASC/DESC, customer trips, partner/admin views, notifications, payments, refunds and workers. Confirm the four proposed ASC rating definitions cover all eight failing shapes.
4. Make the 51-entry recommended manifest active only after that validation. Retain the existing city/descending-price index selected by the planner.
5. Remove the 12 old candidates and the one city/price overlap explicitly, in small batches. Monitor missing-index errors and latency. Never use a blanket delete-unlisted operation without reviewing the resulting list.
6. Rerun the audit after each batch. Recreating a deleted index takes build time; retaining the definition is not an instant rollback.

## Other query issue found

The admin users route can combine roles ARRAY_CONTAINS with searchTokens ARRAY_CONTAINS. Firestore does not allow two array-contains clauses in one AND group. This is an application-query issue; creating another index will not fix it. The 88 valid planner shapes exclude that invalid combination.

## Storage and billing

Unused indexes consume storage and add index-update work during writes. Removing them can reduce storage and write latency; it does not remove source documents or directly reduce the scheduled polling reads discussed earlier. No monetary savings estimate is possible from index counts alone.

Automatic single-field indexes were not disabled. The local fieldOverrides array is empty; potentially large maps/arrays should be reviewed separately against all range, array and ordering queries before adding exemptions.

## Reproduce

```bash
node_modules/.bin/tsx --env-file=.env.local scripts/audit-firestore-indexes.ts --cloud --explain --project=helpkey-a8fab --output=/tmp/helpkey-index-audit.json
```

The audit command has no mutation or deletion mode. Query values are placeholders and analyze=false prevents reading result documents.

Sources: [Firestore index behavior and merging](https://firebase.google.com/docs/firestore/query-data/index-overview), [Query Explain behavior and billing](https://docs.cloud.google.com/firestore/native/docs/query-explain), [Index fanout and storage](https://firebase.google.com/docs/firestore/best-practices).
