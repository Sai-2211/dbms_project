# Proposed schema for approval

Status: approved by the user in this chat on 10 October 2026, before implementation. The user selected “Approve the proposed schema.” The schema below is implemented in `server/schema.sql`.

The repository is empty. The supplied PDF describes entities numbered 1–3 and 8–12, with a relationship list mentioning registration offices, officers, property transactions, and legal documents. The attribute descriptions for entities 4–7 are absent. The following fills those gaps and adds support for the stated ownership, approval, portal, and auditing requirements.

## Twelve primary modules

1. **Owner**: retain owner ID, name, identification number, address, phone, email. Treat identification numbers as strings. Identification number is unique; phone and email need not be unique.
2. **Property**: retain property ID, survey number, property type, area, location, boundary details, registration date and registration status. Add district ID and registration office ID foreign keys. Area must be positive. Types: residential, commercial, agricultural, industrial. An unapproved application may have no registration date.
3. **District**: retain district ID, district name, state name. Make the pair of state name and district name unique rather than requiring district name to be globally unique.
4. **Registration Office** (reconstructed): office ID, office name, office code (unique), district ID, address, phone.
5. **Officer** (reconstructed): officer ID, officer name, designation (survey officer, valuation officer, sub-registrar, auditor), office ID, email, phone, active status.
6. **Property Transaction** (reconstructed): transaction ID, property ID, office ID, type (initial registration, sale, inheritance, gift), transaction date, declared consideration (decimal), status (pending, approved, rejected), approving officer ID, approval date, remarks. The approving officer and approval date are nullable until approval. Approved transactions cannot be arbitrarily edited or deleted.
7. **Legal Document** (reconstructed): document ID, document number (unique), property ID, optional transaction ID, document type, document date, verification status, verifying officer ID, verified date, stored file key, original filename, media type, size, SHA-256 checksum. Files are stored outside the database; their metadata is stored here.
8. **Survey**: retain survey ID, survey number, date, area, boundary details and status. Add property ID and conducting officer ID foreign keys.
9. **Valuation**: retain valuation ID, date, market value, purpose and remarks. Add property ID and valuation officer ID foreign keys. Use a non-negative decimal market value.
10. **Tax Payment**: retain payment ID, tax year, payment date, amount and payment status. Add property ID, payer owner ID, receipt number (unique) and payment reference. Allow several payments per property/year. Use a positive decimal amount.
11. **Encumbrance**: retain encumbrance ID, type, start date, end date, status and details. Add property ID, optional legal document ID and claimant name. An end date cannot precede the start date. End date may be empty for active claims.
12. **Mutation**: retain mutation ID, date, type, description and status. Add property ID, optional transaction ID and approving officer ID. Approval workflows preserve prior records.

## Six additional supporting tables

13. **Ownership**: ownership ID, property ID, owner ID, fractional share (decimal, greater than zero and no more than one), valid-from date, valid-to date, source transaction ID, end transaction ID. This implements the existing many-to-many owner/property relationship and preserves history. A transfer updates only affected shares. The backend enforces a total active share of one after an approved registration/transfer, inside a serializable transaction.
14. **Transaction Party**: party ID, transaction ID, owner ID, role (transferor or transferee), share transferred. This supports co-owners and transfers to multiple heirs without a single seller/buyer limitation. The backend validates party shares and the transferors' current ownership before approval.
15. **User Account**: user ID, username (unique), password hash, role (administrator, owner, survey officer, valuation officer, sub-registrar, bank verifier, auditor), optional linked owner ID, optional linked officer ID, active status. Enables login and role-specific permissions. Browser users never receive database credentials or password hashes.
16. **Audit Event**: event ID, actor user ID, action, entity type, entity ID, timestamp, approved non-sensitive change summary. Append-only through application permissions; records approvals and mutations in the same database transaction as the business change. Raw passwords, identity numbers and uploaded documents are never placed in audit summaries.
17. **Service Application**: application ID, applicant owner ID, property ID, service type (registration, transfer, mutation, encumbrance certificate), status, submitted date, optional related transaction ID, reviewing officer ID, notes. Provides the online application workflow described in the scenario.
18. **Encumbrance Certificate**: certificate ID, certificate number (unique), property ID, period-from date, period-to date, issue date, issuing officer ID, related application ID, snapshot summary. Distinguishes a certificate covering a period from individual mortgage/lien claims. A issued certificate preserves its snapshot.

## Common implementation decisions

- UUID primary keys; explicit foreign keys; creation/update timestamps on mutable tables.
- Consistent SQL names in snake_case; human-readable labels in the interface.
- Status/type checks and numeric/date validation in both the API and database where possible.
- Historical records are retained. Delete actions are restricted once records are referenced or approved.
- Cross-row rules, including ownership share totals and officer designation, are validated by the backend within transactions; a basic foreign key alone cannot enforce these.
- Keep exactly twelve primary navigation tabs, plus Home. Supporting ownership/party records appear within Owners, Properties and Transactions. Accounts/audits live in an administrative drawer; applications/certificates appear within their related modules.
- Use CockroachDB as the actual persistent database. Demonstration data is clearly identified; no silent replacement database or browser storage fallback.

Approval requested: permit the reconstructed four entities, foreign-key/constraint refinements and six supporting tables above. Further changes beyond this proposal will be brought back for permission.

## Public-user role follow-up — 12 October 2026

The user authorized implementation with “just explain the changes, once it is done” and then requested continuation of the different login types. The approved change adds `public_viewer` to the existing `users` role/profile checks, requiring null owner/officer links. No new tables, columns or foreign keys were introduced. The upgrade preserves rows and the 18-table/37-relationship model; public-data restrictions are enforced through explicit backend projections. See [PUBLIC_SIGNUP.md](PUBLIC_SIGNUP.md).
