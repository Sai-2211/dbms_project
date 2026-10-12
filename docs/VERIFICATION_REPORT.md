# Verification and security

Verified 12 October 2026 using Node.js 22.19.0 and a real local CockroachDB 25.4.0 instance. **25 unit tests and 56 integration tests passed**, with no failures or skipped tests. The TypeScript/Vite production build passed. The latest results are summarized in [evidence/verification-summary.json](evidence/verification-summary.json); historical terminal logs are available in Git history rather than duplicated in the working tree.

## Reproduce the checks

Follow the README's local setup first, then run:

```sh
npm test
npm run test:integration
npm run build
npm audit --audit-level=high
```

Integration tests create their own `landledger_test_*` databases, install the approved schema, start isolated API processes on ports 3101–3103 and use temporary upload directories. Cleanup removes only those test resources. Use a development/local SQL user allowed to create databases. The suite does not seed or delete the main application registry. `.github/workflows/ci.yml` runs the same checks with the versioned CockroachDB container on pushes and pull requests.

## Database and workflow coverage

| Area                          | Checks                                                                                                                                                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema and ER explorer        | All 18 tables and 37 FK endpoints/nullability flags match executable SQL and live catalog metadata; nonexistent parents are rejected.                                                                                              |
| Entry validation              | Required fields, primitive types, allowed enums, date validity, decimal scales, positive areas/taxes, tax-year range and protected fields.                                                                                         |
| Registration                  | Uploaded/verified matching deed, verified attachments, office jurisdiction, transferee shares totalling 100%, protected finalized status and repeated approval rejection.                                                          |
| Transfers                     | Sale/gift/inheritance, multiple heirs, joint ownership, partial shares, existing co-owner recipients, historical periods and balanced incoming/outgoing shares.                                                                    |
| Atomicity and concurrency     | Late failure rolls back all changes; conflicting sales cannot consume the same ownership twice; serializable retry handling.                                                                                                       |
| Claims                        | Active mortgages/liens/disputes block approval; released claims remain in history; date and document-property links.                                                                                                               |
| Surveys and valuations        | Correct active designation/office, own linked officer on field writes, latest completed survey updates boundaries, older survey does not overwrite newer measurements.                                                             |
| Applications and certificates | Matching service/transaction links, completion prerequisites, no duplicate finalized application issuance and snapshots of overlapping active/released claims.                                                                     |
| Files                         | Content signatures, size/field limits, generated storage keys, authorized downloads, immutable finalized copies and safe replacement.                                                                                              |
| Accounts and migration        | Salted hashes, login areas, fixed public signup role, rejected privilege overrides, admin-only account creation, private administrator recovery and repeatable public-role upgrade preserving existing rows/passwords.             |
| Training import               | Admin/CSRF/payload checks, collision refusal without partial changes, district reuse, preservation of existing records/accounts, exact history/states, expected blocked cases, certificate snapshots, audit actor and idempotence. |
| Sample recovery               | Exact known PDF identity, media type, byte length and hash; download after temporary-file loss; no recovery on hash mismatch; bank access remains denied.                                                                          |

## Security coverage

| Control               | Verified behavior                                                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQL injection         | Values use bound parameters; server metadata restricts table/column identifiers; injection strings do not become executable SQL or expose unrelated records.     |
| Stored XSS            | React renders record values as text; CSP restricts scripts; markup fixtures do not execute.                                                                      |
| Authorization         | Backend roles and owner predicates apply to lists, details, files, writes, schema and accounts. Client role/status overrides cannot grant privileges.            |
| Public privacy        | Registered-only projection contains exactly the permitted fields; hidden locations/claims cannot be searched or inferred through filters; no public bulk export. |
| Private owner data    | Other owners' identity/contact fields are redacted for owner/bank views and excluded from private-field search.                                                  |
| Sessions              | Signed tokens reject tampering, expire after eight hours and require an active account; cookies are HTTP-only and SameSite with production Secure.               |
| CSRF and origins      | Writes require the application header and an allowed origin.                                                                                                     |
| Throttling and limits | Login/signup attempts are limited independently; authenticated API, upload and body limits apply.                                                                |
| Errors and secrets    | Password hashes/private file keys are not returned; audits omit raw passwords/identity input; database errors receive bounded messages.                          |
| CSV export            | Department exports escape cells and neutralize spreadsheet-formula prefixes; public export is unavailable.                                                       |
| History protection    | Generic edits cannot finalize records or rewrite ownership/audit history; finalized records are preserved.                                                       |

The installed dependency advisory check is a point-in-time result, not an independent penetration test or a guarantee against undisclosed vulnerabilities.

## Interface and hosted checks

The workspace, all 12 record tabs, persistent form entry, Unicode, escaped HTML, dependent dropdowns, filtering, pagination, record details and ER interactions were inspected. Public signup, password visibility, limited public details and desktop/mobile layouts were also checked. Current screenshots are retained only where referenced by the README or demo/privacy guides.

On 12 October 2026, the authorized hosted training import created **138 registry rows plus audit events**, preserved existing accounts, and reported four registered properties, two intentionally pending transactions, fourteen ownership-history rows and thirteen sample attachments. The hosted property detail showed the expected ownership history and latest area, and an authorized deed download exactly matched the versioned sample PDF. [TRAINING_IMPORT.md](TRAINING_IMPORT.md) describes the dataset and workflow.

## Practical limits

These are regression cases and focused UI/source checks, not exhaustive fuzzing, a load test or security certification. Local checks use a single database node. Multi-node failover, coordinated backup recovery, external government/deed verification, real payment/lending workflows and malware scanning have not been demonstrated.

Audit rows remain editable to privileged SQL administrators. Logout clears a cookie but does not individually revoke an already issued stolen token; account deactivation and expiry still apply. Rate-limit counters are process-local. File signatures do not fully parse documents, and arbitrary uploaded files on Render Free remain temporary. Only the exact versioned training PDF has recovery support. Survey numbers are not globally unique physical parcel identifiers in the approved model.
