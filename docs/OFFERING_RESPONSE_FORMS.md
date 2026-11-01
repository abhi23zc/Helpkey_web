# Universal offering responses

An offering's response, quantities, price, category and audience are independent.

`responseConfig` is optional for compatibility:

```json
{ "responseType": "single", "quantityEnabled": false }
```

Response types are `yes_no`, `single`, `multiple` and `text`. Every offering is optional. A text response must be nonblank when the guest selects the offering. Single-choice responses allow one distinct option; with quantities enabled the guest can request several units of that option.

Selections retain the existing `{ offeringId, variantId, quantity, inputs }` contract. Yes/no and text have no variant ID. With quantities off each selected option has quantity one. `maxQuantity` is shared across an offering, not per option. For multiple selections without quantities, it limits distinct choices. Selecting another single option replaces the previous selection atomically.

`resolveResponse` in `lib/stay/response.ts` is the compatibility boundary. It uses explicit response settings first, otherwise retains the old form behavior, including quantity-bearing variants, packages and scheduled services. Existing catalog entries are not rewritten by a migration or by simply opening the editor. An older editor cannot discard an existing explicit response configuration; it receives a refresh instruction.

Room preferences can be free or paid and can use the same confirmation rules as other offerings. A variant's null price inherits the default, an explicit zero means free, and an omitted override retains an existing saved override. Changing the offering kind does not erase prices. Multiple selections add their individual charges; existing per-stay, per-night, person and service-hour calculations remain unchanged.

New requests contain a `requestRules` snapshot alongside their existing option labels and financial terms. Free request input edits use those saved rules and respect preparation/deadline locks. Changing guest details with unchanged quantity is an actual edit, resets the hotel response, and is persisted. Existing paid/quoted commitments retain their current change and payment restrictions.

The editor preserves options/prices while switching draft settings, confirms destructive option removal on save, and uses the same response controls in its guest preview, checkout and pre-arrival forms. Preview requests do not create bookings or requests. The illustrative pricing context is two nights, two adults and one child; service times are labelled Asia/Kolkata.

No database migration, new indexes, global admin permission expansion or additional after-booking payment flow is required.
