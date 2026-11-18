# Phase 3B review — 14 November 2026

Verdict: both credit-note snapshot findings below have been fixed. The initial review changed no product source; the subsequent fix pass updated issuance, printing and permanent regression tests.

## Resolution

Credit notes now copy the original invoice's complete seller snapshot, including legal name/address and historical presentation fields, and retain its recipient. Current settings still control numbering and issuance eligibility; the existing registration/GSTIN mismatch blocker remains enforced. The original reference also records the original settings revision, independently of current issuance settings metadata.

Every newly issued credit-note line saves server-derived `originalLineId` and `originalSourceId` beside its own line ID and reduction source. Printing displays escaped original references. Older immutable notes lacking these references explicitly state that their historical line reference is unavailable; existing issued documents are not rewritten or guessed from aggregate credit caps.

Permanent regression coverage changes legal name, address, contact and footer after invoicing; credits multiple original lines in a different order; retries the exact request; issues a repeated partial note; verifies per-original-line caps; and confirms original invoice and prior note printing remain unchanged. A print regression verifies reference escaping and the historical fallback label.

Final fix verification: **629 unit tests passed** (178 emulator/external tests skipped in that run), **25 invoice/folio emulator transaction tests passed**, and **8 desktop/mobile browser tests passed**. TypeScript and worker builds passed; lint reported **0 errors and 97 existing warnings**; `git diff --check` passed. A fresh production Next build was not run. No deployment, migration or live financial mutation was performed.

## Original P2 finding (resolved) — Credit notes can switch seller identity after settings changes

In `lib/partner/invoices/service.ts:438`, the original seller check compares only GSTIN and registration. The final snapshot at line 579 uses the current settings as seller. An owner can change the legal name/address in settings after issuing an invoice, then issue a credit note for that invoice using the new seller information. This contradicts the documented original-seller preservation/external-review policy.

A disposable emulator probe issued an invoice, changed the configured legal name, then successfully issued its linked credit note. The saved note's seller name differed from the invoice's seller name. The original invoice itself remained unchanged.

Define and enforce the intended seller-identity rule: retain the original seller snapshot for linked credit notes, or explicitly block identity changes requiring external review. Distinguish current numbering/issuer configuration from original seller identity. Add a permanent regression test for legal name/address changes with unchanged GSTIN/registration.

## Original P2 finding (resolved) — Issued credit-note lines lose their original invoice-line reference

The credit-note command validates each requested `lineId` against the original invoice and updates aggregate per-line credit caps. However, the snapshot line creation around `lib/partner/invoices/service.ts:516` saves the supplied particulars and a newly assigned sequential ID without retaining the allocated original line ID. For a generic reduction, `sourceId` points to the reduction, not the original invoice source.

The probe allocated a generic credit to original invoice line 2. The issued note stored its own line ID 1 and no originalLineId/originalSourceId. Its original document reference identifies the invoice, but does not identify which original line this particular note credited. Aggregate caps remain enforced, yet historical per-note allocation is not fully reconstructable from the immutable document.

Persist explicit original invoice-line/source references on every credit-note line and expose them in document review/history/print where useful. Test a note allocating to non-first and multiple original lines, including repeated partial notes.

## Scope and next phase

Fresh verification: **628 unit tests passed**, 177 skipped in unconfigured emulator/integration suites; **24 invoice/folio emulator transaction tests passed**; **8 desktop/mobile billing and invoice browser tests passed**. TypeScript passed. ESLint reported **0 errors and 97 existing warnings**. `git diff --check` passed. One additional temporary emulator probe positively reproduced both findings; its passing assertions describe the current incorrect behavior, not a fix. Production and worker builds were not rerun in this review; earlier build results belong to the implementation notes.

The reviewed code includes transactional hotel/year numbering, immutable snapshots, source claims, exact retry recovery, stale-review rejection, hotel/role checks, and bounded credit allocations. Issuance creates documents without duplicating folio charges or initiating refunds. No legal compliance certification or production behavior verification is implied.

The agreed next phase remains **3C — in-house stay changes: room moves, upgrades, extensions and early departures**, with transactional inventory, explicit price review and consistent folio/document handling. The implementation notes' suggested e-invoice/debit-note expansion is additional scope, not a replacement for this agreed phase sequence.

No deployment, production invoice issuance, index publication, policy change or live financial mutation was performed. Temporary probe source was removed; test writes used disposable local emulator hotels.
