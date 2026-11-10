# Combined extras offers

Set `STAY_BATCH_OFFERS=1` in the server environment and restart the application. Set it to `0` to stop creating new combined offers; published offers and their payments remain available. Local development is enabled in `.env.local`.

Hotel staff save prices per request, approve free requests immediately, and send one combined offer after all pending new requests are reviewed. Guests select paid items, explicitly accept (unchecked items are declined), and pay the selected total in one Razorpay order. Later requests form the next offer. Existing individual quotes remain payable individually.

Batch offers are stored on bookings as `extrasOffers`; request records carry `offerDraft` and `offerId`. Authenticated GET/POST `/api/[partner/]bookings/[bookingId]/extras-offers` supports publish/withdraw for partners and accept for guests, with revision/version checks. Existing stay-quote-payment routes accept the offer ID as requestId and offer version as quoteVersion; all allocations and totals are derived on the server.

One paymentAttempts record represents a combined capture. Per-request stayPaymentReceipts allocate its amount without duplicating money. Cancellation refunds use payment-plus-request identities for batch allocations. Refund processing updates only the affected allocation; provider refund totals remain bounded by captured funds. Unresolved payment orders block offer withdrawal; late captures queue full refunds.

Validation: `npm test -- tests/stay-offer-domain.test.ts tests/stay-upgrade.test.ts tests/stay-response-service.test.ts`; run `tests/stay-transactions.emulator.test.ts` with FIRESTORE_EMULATOR_HOST pointing at an isolated demo-helpkey-bookings Firestore emulator. No production provider charges are made by these tests.
