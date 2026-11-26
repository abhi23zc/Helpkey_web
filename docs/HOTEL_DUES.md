# Hotel Dues — Step 5

Hotel Dues shows verified amounts the hotel owes Helpkey and records payments received externally. It uses `hotel_dues` in the existing accounting journal, including saved room and service agreements. It does not calculate a separate commission, use today's commission terms for existing bookings, initiate a bank transaction, or deduct dues from payouts.

## Pages and normal workflow

- Admin: `/admin/dues`, beside Hotel Accounting and Hotel Payouts. A selected hotel can be opened with `/admin/dues?propertyId=<hotel-id>`. Accounting and Payouts link to the selected hotel's dues.
- Owner: `/partner/dues`, using the existing hotel selector. Owners can inspect their own balances, payment allocations and history. Staff and other hotels cannot access the data. Owners cannot record or correct payments.

The three main summaries are **Outstanding dues**, **Payments received**, and **Bookings needing attention**. Outstanding includes only verified positive balances. Payments received is the sum of recorded receipts less full corrections; linked replacements count once. Amounts with unresolved sources, pending accounting, missing evidence, negative dues or journal differences appear in **Needs attention**, outside verified outstanding dues. They never reduce another booking's amount.

1. In **Outstanding**, select up to 50 bookings and choose **Record payment received**.
2. Enter an amount in rupees (greater than zero, at most two decimal places), payment date, method, transaction reference and optional notes. Blank amounts are rejected. The selected maximum is displayed; overpayments are unsupported.
3. Choose **Review allocation**. Money is allocated oldest recorded dues first, using the first journal recording that established positive dues for each booking. Booking ID breaks timestamp ties consistently. Missing reliable ordering evidence requires review. This ordering date is not an overdue date.
4. Check the confirmation: hotel, exact amount, date, method, reference, booking allocations and remaining dues. For A owing ₹200 and B owing ₹300, receiving ₹350 clears A's ₹200 and ₹150 from B, leaving ₹150 due.
5. Choose **Confirm payment received**. This records an existing external payment; it neither charges the hotel nor starts a transfer. Open **Payment history** to inspect allocations, actor, date and permanent lifecycle history.

Confirmations expire after ten minutes and hold no money. If another admin changes a selected balance or financial evidence changes, saving requires a new review. The UI removes an obsolete confirmation and refreshes eligible selections; it never silently saves a different allocation. A lost-response retry of the same save recovers the committed result.

Payment dates must be valid and not in the future in the configured hotel timezone. Bank transfer, UPI, cheque, cash and Other each require a transaction reference. Reference matching is scoped to hotel and method, trims surrounding whitespace, and ignores letter case. An ordinary duplicate is rejected even if its earlier record has been corrected.

## Correcting a mistaken record

In **Payment history**, an active admin can choose **Correct recording**, enter a reason, **Review correction**, and **Confirm correction**. The entire recording is reversed against its original bookings exactly once. The original receipt is never edited or deleted. A correction does **not** return money through a bank.

For example, a real ₹350 payment with bank reference `UPI123` was allocated to the wrong bookings. Correct its record, then choose **Record replacement**. Select the correct bookings, review the amount and allocations, and confirm. This explicit replacement reuses `UPI123` and its original method, links to the corrected record and counts the receipt once. Only one replacement is allowed per corrected record. If its replacement is also mistaken, correct that replacement and continue the linked chain.

Corrections remain available when booking sources changed or disappeared, provided the original receipt and journal entries reconcile. They reverse the original allocations, without transferring money to other bookings. If the resulting source accounting still requires review, use **View accounting** to resolve the evidence and retry accounting processing; a correction is not approval of an unsupported booking adjustment.

## Policy and limitations

The expandable **Dues policy** displays effective dues limit, warning threshold and grace period, including explicit unconfigured values and an Unlimited limit. Verified outstanding reaching a configured warning or limited balance produces a warning.

There is no supported rule defining the starting event for a grace period or an overdue date. Step 5 therefore does not mark bookings overdue or invent due dates. These settings never restrict bookings, collect money, or offset payouts.

This phase supports INR, positive receipts against selected verified booking dues, and full record corrections. It does not support unapplied overpayments, partial corrections, tax filing, provider transfers or booking restrictions. The hotel workspace currently loads its booking/payment history together; very large histories may need pagination in a later phase. Admin hotel selection is paginated using the existing hotel directory.

## Accounting and private APIs

Private collections:

- `hotelDuesPaymentsV1`: immutable receipt, booking allocations, payment metadata, recording actor/time and replacement link; append-only `history` subcollection.
- `hotelDuesCorrectionsV1`: one permanent correction per original receipt, including reason and original-receipt fingerprint.
- `hotelDuesReferencesV1`: deterministic hotel/method/normalized-reference slot; serializes duplicates and linked replacements.
- `hotelDuesConfirmationsV1`: actor-bound ten-minute evidence/amount/allocation snapshots; no operational reservation or journal posting.
- `hotelDuesRequestsV1`: actor-scoped request IDs and complete payload fingerprints for retry recovery.

Admin GET `/api/admin/dues` lists hotels (`after` supported); `?propertyId=<id>` returns the workspace. GET `/api/admin/dues/<paymentId>?propertyId=<id>` returns payment detail. POST `/api/admin/dues/commands?propertyId=<id>` accepts UUID `requestId` and these actions:

- `preview_payment`: `payment` contains `bookingIds`, decimal-string `amountRupees`, `paymentDate`, `method`, `transactionReference`, optional `notes`, optional `replacesId`.
- `preview_correction`: `paymentId` and `reason`.
- `record_payment` or `correct_payment`: `confirmationId` from the matching preview.

Preview responses contain `confirmation`, normalized integer-paise amounts, allocations and expiry. Successful saves return `paymentId` and Received/Corrected status. Stale/expired confirmations, duplicate references and conflicting request IDs use explicit errors. Owner-only GET APIs are `/api/partner/properties/<propertyId>/dues` and `/dues/<paymentId>`. Responses reuse private/no-store handlers. Existing Firestore rules deny direct browser access to all these collections; public hotel and guest booking DTOs are unchanged.

Recording rechecks active admin, ownership, current source evidence, recognized journal effects, summary, selected balances, preview and reference ownership in one transaction. It atomically writes the receipt/history/request, stable per-booking events and journal-derived summaries. Events debit `hotel_dues_receipt_clearing` and credit each booking's `hotel_dues`; correction events append exact linked reversals. No guest collection, recognition, commission-income or hotel-payable posting is invented.

Accounting processing, reconciliation, summary rebuilds and payment history understand both dues event types. Unchanged processing preserves reduced balances and corrections. Later financial changes preserve receipts, reverse affected recognition through existing accounting rules and flag resulting credit dues for review. Dues receipt events are excluded from payout assessment fingerprints because they do not change payable entitlement. No cross-booking redistribution or payout offset occurs.
