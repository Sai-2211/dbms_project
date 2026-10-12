# Hosted training dataset import report

Confirmed on 12 October 2026 in the hosted Render app at https://dbms-project-dph6.onrender.com/. The user signed in privately as administrator; the import ran through that authorized app session. No cloud database credentials were read or published.

The controlled import reported **Records loaded successfully**. It created **138 registry rows**, plus automatic audit entries. This comprises the 119 specified workbook rows, 14 generated ownership-history rows and five generated transfer-mutation rows. No districts needed reuse in this hosted database. Existing accounts and passwords were preserved; optional workbook test accounts were not created. No schema changes were required.

## Saved records

| Table | Rows created |
|---|---:|
| districts | 2 |
| offices | 2 |
| owners | 8 |
| officers | 8 |
| properties | 6 |
| surveys | 8 |
| valuations | 6 |
| transactions | 12 |
| transaction_parties | 20 |
| documents | 15 |
| applications | 15 |
| mutations | 8 |
| encumbrances | 4 |
| tax_payments | 7 |
| certificates | 3 |
| ownerships | 14 |

## Verified behavior

- Six properties appeared in the hosted Properties page, with four Registered and two Pending.
- The populated dashboard showed eight owners, two pending transactions, and INR 95100.50 in receipts marked Paid.
- Import-time checks verified nine Approved transactions, two Pending and one Rejected; all document/application/mutation/survey/tax/claim status totals; exact ownership periods and source/end transactions; 100% current shares; latest survey areas; and certificate snapshots. All these checks occurred before the single database transaction committed.
- Both expected approval failures were checked: missing verified evidence for the unfinished registration and an active mortgage for the proposed industrial sale. Neither changed ownership.
- Fourteen ownership history rows were created: eight Current and six Ended. In the hosted residential property detail, Aarav's 100% → 75% → 50% history, Meera's unchanged current 25% and Kavin's current 25% were visibly present.
- The residential detail showed the latest 245.4000 m² area, matching office, related registration/sale/gift transactions, surveys, valuations, documents, claims, taxes, mutations, applications and certificate.
- Thirteen uploaded fictional sample documents were reported. A verified hosted registration deed displayed its matching property/transaction, reviewing registrar and SHA-256 metadata. Its authorized download succeeded and exactly matched the supplied sample PDF bytes.
- The importer was tested for repeated-request idempotence in an isolated database; no duplicate records or sample files were added. It also refused conflicting identifiers without changing existing records.
- The known training PDF can be recovered from versioned sample bytes after Render Free deletes temporary storage, only when identifying metadata, media type, length and SHA-256 match. A hash mismatch and bank access were rejected in integration checks. Other uploaded files still need persistent storage.

## Automated verification

25 unit checks and 56 isolated CockroachDB/API integration checks passed. The production TypeScript/Vite build passed. A final focused integration rerun passed after adding exhaustive import-state checks. Evidence is retained in docs/evidence/training-import-*. The importer implementation was pushed as commit f273fa0. These tests used disposable local databases; the subsequent explicitly authorized import populated CockroachDB Cloud through the hosted app.

## Continue exploring

Use the 12 main tabs for primary records and your username menu for ownership history, service applications, certificates and audit trail. Add one or two records through the forms when ready. For a new property, save its details first, then create its registration transaction, transferee parties and matching uploaded/verified deed before approval. Existing login passwords still apply.

The screenshots alongside this report show the hosted import confirmation and populated dashboard.
