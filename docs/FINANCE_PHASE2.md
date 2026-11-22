# Phase 2 finance contracts and operations

Implemented in the web workspace and sibling `../app` Expo workspace. Existing uncommitted Phase 1 finance work and unrelated mobile edits are retained. Nothing is deployed. There is no historical migration, database reset, accumulated-balance posting, dues enforcement, payout execution, or transfer integration.

## Calculation boundaries

`lib/booking/domain.ts:evaluateStayRules` evaluates dates, duration prices, inventory bounds and capacity without tax or payment calculations. Its legacy `evaluateStay` wrapper remains for existing consumers/tests; new agreement paths use the rules evaluator and `lib/finance`.

`lib/finance/calculation.ts` owns safe integer paise, basis points, BigInt intermediates, half-up rounding, line reconciliation, inclusive reversal, payment choices, commission, cancellation refunds and linked reductions. Charge IDs are stable. Overnight thresholds apply to each dated room/unit; hourly accommodation needs a rule explicitly scoped to hourly mode. Included/free requests and requests awaiting hotel review never create extra charge lines.

Component rounding uses a rounded aggregate tax, component floors and remainder paise in saved component order. Reductions allocate against remaining saved component capacities. They reference an original agreement and original line; they do not consult current tax rules. Private commission reversals use cumulative saved taxable amounts to avoid rounding drift. Negotiated room amounts are entered amounts in the reviewed hotel basis, distributed across dated room lines before tax.

## Version 2 public contract

A quote's `calculation` contains:

- `version: 2`, `lines`, `taxablePaise`, `taxPaise`, `totalPaise`;
- `available`, `selected`, `excluded`, `advanceBasis`, `payableNowPaise`, `hotelBalancePaise`;
- explicit `cancellation` terms and applicable `versions`.

Each line saves entered unit amount, quantity, price basis, service category, service dates, supplier, invoice responsibility, rule/version, taxable amount, tax components and final amount. `versions.financialInputs` is an opaque hash of all financial dependencies, including private policy inputs. It does not disclose their values.

`paymentOption` is `full_online | advance_online | pay_at_property`. Collection method remains separate. Customer choices use the Admin hotel override when present, otherwise global defaults, then an optional nonempty rate restriction. Global defaults are not a platform-wide prohibition. Advances apply to the entire final checkout amount. Fixed advances are capped. Choices below the existing ₹1 online gateway minimum are excluded. Payment-option changes fetch a new quote and clear acceptance.

Customer creation requires `expectedTotalPaise`, `quoteFingerprint`, and affirmative `termsAccepted: true`. A saved global commercial policy is required; quotes do not activate defaults in an unconfigured project. Hotel-created submission also requires both after an authoritative manual quote. A negotiated amount sent to manual quoting/creation is still named `negotiatedSubtotalPaise` for transport compatibility; its meaning is **entered room amount in the reviewed basis**, including tax when that basis is inclusive. Staff pricing permissions remain enforced.

Booking commit rereads rates/date overrides, selections, policies, tax registry, immutable rules, reviewed profiles and supporting documents in the inventory transaction. Fingerprints cover choices and dependencies. Payment recovery reuses committed amounts and order identities rather than current rates.

Private `bookings/{id}/financialAgreements/{agreementId}` records contain the public calculation plus internal source classification, commission, provider-charge allocation and pending deduction provenance. Original agreements are immutable. Services, extensions, charged category changes and amendments save additional agreements; complimentary moves do not create supply charges. `financialAdjustments` retains linked component reversals. Customer detail responses project only public history and derive current agreed stay totals from those records. Historical bookings without v2 agreements remain readable; unsupported repricing/reduction offers fail closed rather than invent historical tax components.

Independently accepted services default to full online collection. An explicit hotel-collection assignment is saved separately and cannot create a gateway order. Service acceptance checks its calculation fingerprint and amount. Service cancellation uses its own saved terms; partial refundable amounts remain separate from the original payment receipt amount.

Expo parses v2 amounts, lines, components, options and reconciliation strictly. Unsupported formats do not become a default payment option. Existing unresolved legacy recovery evidence is retained. The SecureStore journal can retain the committed amount and calculation version without storing the full potentially oversized calculation.

## Tax publication and property review

Admin Finance includes a tax configuration workspace and `/api/admin/finance/taxes`:

1. Prepare a reviewed version (`action: create_version`) with a category, declared conditions, date basis, components, legal reference and review metadata. Versions cannot be overwritten.
2. Preview an example (`action: preview`) without writes or accumulated-value changes.
3. Publish a complete active set (`action: activate`) using `expectedRevision`, `active` rule references and `coverage`. Publication rejects overlapping scopes and declared date/value coverage gaps, and increments the active registry revision. This invalidates quotes even when a newly published rule would become applicable.

Conditions are restricted to category, jurisdiction, registration/profile kind, booking mode, taxable-unit ranges and effective dates. There are no scripts or arbitrary formula inputs. Percentage, zero-rated and exempt treatments are supported; zero/exempt need a reason. Accommodation date bases are explicitly nightly or hourly. Dated services use fulfilment dates; applicable fees use agreement dates. Missing required dates and absent/expired/ambiguous/unreviewed coverage block quotes.

A property tax profile is separately reviewed and versioned under `propertyFinance/{id}/taxProfiles`. Submit its profile and expected revision using the tax endpoint's `?propertyId=...` parameter. It must reference the current manually reviewed Phase 1 profile content revision and the same registration status. Phase 1 supporting-document validity is checked independently at quote and commit.

Supplier profiles, including HelpKey when charging its customer fee, are reviewed/versioned separately in `financeSupplierProfiles`. The same endpoint accepts `?supplierId=helpkey` with `expectedRevision`, `profile`, `legalReference`, and `reason`. A HelpKey fee does not borrow the property's supplier tax profile. Missing supplier configuration blocks that offer.

Cancellation terms require a saved free deadline, explicit fixed or percentage late charge with its basis, no-show terms, and an active reviewed cancellation-tax reference `ruleId:version`. Phase 2 supports a reviewed zero-rated/exempt retained-amount cancellation treatment scoped to category `cancellation`, mode `service`, and date basis `agreement_date`. Percentage cancellation-tax treatments remain unavailable because their additional invoicing/assessment is not implemented. No implicit penalty or unpaid-hotel-balance collection is introduced.

## Price review

Rates, date overrides, hourly duration prices and priced offering variants are associated with reviewed entry basis. Editors send `priceEntryBasis`; the server verifies current effective policy and records the reviewing actor/time. Global or hotel basis changes invalidate mismatching entries for new agreements immediately. Owners review/re-enter prices and re-save them; stored numbers are never converted automatically. Existing accepted agreements remain unchanged.

Rate editors support payment restrictions and authoritative previews. Priced extras require a tax category and dated fulfilment input. Service quotes collect explicit classification, basis and cancellation terms. Search starting prices expose their saved basis, or indicate that basis review is needed; final stay amounts come from authoritative calculations. Projection changes are additive and require no backfill/reset to preserve existing data.

## Explicit synthetic fixtures

No fixture executes during application or worker startup. The command refuses unconfirmed or unguarded environments and refuses to replace existing registry/rule documents.

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8096 \
FIREBASE_ADMIN_PROJECT_ID=demo-helpkey-finance-fixtures \
npm run finance:fixtures -- --confirm-synthetic-fixtures
```

A development project is allowed only with `NODE_ENV=development` and a `helpkey-dev-` project ID. Emulator fixture commands require a `demo-helpkey-` project ID. Examples use jurisdiction/profile kind `example`, explicitly synthetic split taxes totalling 10%, and a synthetic exempt cancellation rule. These are mathematical examples, **not applicable-law defaults**. The command does not approve property documents/profiles, re-enter rates, update bookings or create balances. Supply matching reviewed development profiles/prices explicitly when exercising a full booking.

## Production prerequisites and verification limits

Before enabling production offers, an authorized reviewer must supply applicable tax rules and legal references, property jurisdiction/registration/profile information, supplier and invoice responsibility, HelpKey fee supplier profile where needed, cancellation-tax treatment, explicit commercial terms and reviewed price entries. Missing information makes the relevant offer unavailable. Deduction identities/reference inputs are saved with pending-assessment reasons; actual deduction editing, usable estimates, assessment and posting remain Phase 3.

Validation results are recorded in `FINANCE_PHASE2_VALIDATION.md`. Browser suites use real React components with deterministic HTTP fixtures; provider calls in emulator tests are mocked. These checks do not constitute native-device validation, live Razorpay validation, legal review or production deployment.

## Follow-up regression fixes

Accepted hotel-collection service quotes contribute to the reservation's collectible balance and public stay history. Hotel receipts, partial collections and reversals use that same balance. Hotel-collected services are excluded from the separate online-service totals, preventing double counting. They also appear as separate invoice sources.

The existing stay transaction suite now supplies real reviewed synthetic finance configuration, authoritative quotes and explicit consent. Its fixed-advance and legacy-accounting cases remain covered. The Phase 2 finance emulator suite is included in the PMS CI command.
