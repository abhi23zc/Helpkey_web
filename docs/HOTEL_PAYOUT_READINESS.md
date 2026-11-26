# Hotel business and payout readiness (Step 8)

Admin: `/admin/properties/[propertyId]/payout-readiness`, linked from hotel management and Hotel Payouts. Owner: `/partner/settings/bank?propertyId=…`, linked from Hotel settings and partner payouts. APIs use strict authenticated requests and transactionally check active administrators or the current property's active owner membership. Staff cannot read, save, reveal or review bank details. A stale owner membership does not grant access after ownership changes.

The page is advisory. Incomplete information and pending reviews do not block existing hotels, payout preparation or existing prepared amounts. Existing booking eligibility, accounting reconciliation, minimum payout, deductions, cancellation and retry rules still apply. No legacy KYC or payout-eligibility gate is activated.

## Setup

1. Check Business details. The hotel display name is separate from legal identity. Configured invoice identity takes precedence; otherwise the existing `partnerProfiles` business profile is used. No invoice/tax setup is required for a profile. Supply a business name, usable address and at least one contact. Profile edits affect every hotel owned by that partner. The invoice identity editor uses the existing invoice schema and issuance lock, changes only identity fields, and preserves numbering, signatory, footer and unrelated configuration.
2. Enter bank holder, account number twice, IFSC and bank name. Numbers stay strings, including leading zeroes. The checks validate formatting and matching input, **not ownership, account existence or bank verification**. An admin performs an external check and explicitly selects **Mark bank details Reviewed**, with a note.
3. Review Commercial terms. These use existing effective finance settings and editor. Each configured value identifies whether it is Helpkey's default or a hotel override. Check commission applicability, commission basis/rate where applicable, eligible extras where applicable, payout waiting period, minimum, cycle and weekly weekday. Confirm with an admin note. Saved booking and service agreements remain unchanged.

Missing required information takes precedence. Once complete, the primary action prioritises bank review, then business review, then commercial review. All three complete/current reviews produce Ready for payouts.

## Encryption and privacy

Configure `HOTEL_BANK_ENCRYPTION_KEY` on the server as **64 hexadecimal characters representing 32 random bytes**. Generate a dedicated key with `node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))'` and place it in the deployment's secret configuration. Do not commit it or expose it as a `NEXT_PUBLIC_` variable. Preserve it across deploys and backups. Replacing it without migrating existing ciphertext makes existing accounts unreadable; automated key rotation is not implemented.

Accounts use AES-256-GCM with random IVs and authenticated property/owner binding. Protected bank payload and content fingerprints use HMAC-SHA256. Private records live in `hotelPrivateBanksV1`; review metadata, request receipts and masked change history live in `hotelPayoutReadinessV1`. Neither bank numbers nor encrypted accounts are copied into property documents, payout snapshots, statements, request receipts or audit histories. Browser Firestore access remains denied by the existing default-deny rules.

Default private read APIs return only holder/bank/IFSC, masked last four digits and version. Full numbers require a separately authorised POST to `/reveal`, bound to the current bank version. Reveal responses are `private, no-store`; the UI uses component memory, clears the number after 30 seconds or on blur/visibility change, and does not put it in React Query or browser storage. Reveal audit records contain actor, time and bank version only.

Missing or malformed encryption configuration disables bank saves and reveal. It does not add a readiness gate to payouts.

## Changes, reviews and conflicts

Business review fingerprints cover identity source, business name, address, contacts, tax identifiers, registration/state identity and owner. Invoice series, numbering and footer changes do not invalidate business review. Commercial fingerprints cover relevant effective terms **and their inheritance source**, excluding unrelated dues and guest payment configuration. Bank reviews clear on any actual saved bank-field change; unchanged saves and duplicate requests preserve the review and bank version. Ownership changes invalidate reviews and hide the former owner's bank record from the new owner, including historical masked account metadata in owner payout responses.

Save/review requests carry a UUID request ID and expected workspace version. Transactions serialize against property ownership, business/invoice source records, finance settings, bank and reviews. Stale edits return 409; the UI retains the draft until the user refreshes and reviews the latest information. Identical retries recover the committed result; reused IDs with different content conflict. Review history retains notes, actors, timestamps and reviewed fingerprints separately from source information.

## Payout integration

New preparations save immutable business identity and masked bank metadata/version. Prepared amounts and original booking agreements are preserved. A payment command compares the preparation bank version with current banking inside the payment transaction. If the bank changed or no saved baseline exists, the user must explicitly acknowledge the current bank version. A subsequent bank change makes that acknowledgement stale and requires a fresh check. No bank account can still be acknowledged explicitly; readiness remains advisory.

Payment lifecycle history records masked payment-time bank metadata and the acknowledged version. Exact retries recover the already committed payment even after later bank changes. Paid records remain immutable. Statements read saved preparation/payment snapshots; historical missing identity/bank information stays labelled unavailable. No historical backfill uses today's profile or account.

No transfers, verification services, uploads, tax calculations, fee-responsibility policies or finance roles were added.

Local development also accepts a passphrase of at least 10 characters, deriving a 32-byte key with scrypt and a fixed application-specific local salt. Production still requires the random 64-character hexadecimal key described above. Changing between a local passphrase and a hexadecimal key requires migrating any previously saved ciphertext.
