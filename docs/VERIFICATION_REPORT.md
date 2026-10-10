# LandLedger: verification and security report

**Date:** 10 October 2026  
**Application checkpoint:** `a112d51`  
**Database:** real CockroachDB 25.4.0, local single node  
**Runtime:** Node.js 22.19.0, macOS  
**Result:** 50 automated tests passed — 11 unit checks and 39 database/API checks. No failures or skipped tests in the final runs.

## Verified results

| Check                                     | Result                                             | Evidence                                                                                                                        |
| ----------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Unit validation/auth/export suite         | 11 passed                                          | `npm test`; `evidence/validation-final.tap`                                                                                     |
| Isolated CockroachDB/API suite            | 39 passed                                          | `npm run test:integration`; `evidence/integration-final.tap`                                                                    |
| TypeScript and frontend production build  | Passed                                             | `npm run build`                                                                                                                 |
| Installed dependency advisory audit       | 0 known vulnerabilities                            | `npm audit`, at verification time                                                                                               |
| Standalone built frontend/API smoke check | Passed                                             | HTML and built script served; unauthorized records rejected; authenticated live schema returned                                 |
| Actual schema                             | 18 tables, 37 foreign keys                         | Catalog response and approved SQL comparison                                                                                    |
| Missing-parent rejection                  | All 37 FK cases passed                             | Deliberate invalid-parent updates in the isolated test database                                                                 |
| Browser record navigation                 | All 12 primary tabs loaded their own database rows | 24 properties, 9 owners, 4 offices and populated examples in other modules                                                      |
| Persistent browser entry                  | Passed                                             | Created fictional district, reloaded, found saved row                                                                           |
| Stored HTML/Unicode rendering             | Passed                                             | `<img ... onerror=...>` displayed literally; table contained zero image elements and escaped markup; Tamil text retained        |
| Relationship controls                     | Passed                                             | Selecting Chennai reduced the office dropdown to Chennai Central Registry                                                       |
| Pagination/status filter                  | Passed                                             | Property page two displayed records 11–20; Pending filter showed four pending transactions                                      |
| ER interactions/export                    | Passed                                             | Table selection, related-table filtering, fit view, inspection and JSON download; export verified as 18 tables/37 relationships |
| Formatting/whitespace consistency         | Passed                                             | Prettier and `git diff --check`                                                                                                 |

The two fictional district records created through the browser were removed through the API after checking them. Automated integration tests never modify the main application database: each run creates its own `landledger_test_*` database, installs the approved schema, launches a separate API and private upload directory, and drops only those test resources afterward.

## Relationship and workflow coverage

| Category             | Cases exercised                                                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registration         | Valid property, parties and deed entry; upload; verification; approval; persisted registered status/date and current holding; repeated approval rejected   |
| Transfers            | Full sale, partial 25% sale, inheritance, gift, corresponding deed requirements and retained previous ownership                                            |
| Consistency          | Equal incoming/outgoing shares; initial 100% rule in approval logic; insufficient/incomplete holdings; same-owner transfer blocked; chronology checked     |
| Atomicity            | Intentional late audit-FK failure rolled back ownership, transaction and mutation changes                                                                  |
| Concurrency          | Two simultaneous competing sales of one holding resulted in exactly one success                                                                            |
| Foreign keys         | Every implemented FK rejected a nonexistent referenced parent                                                                                              |
| Jurisdiction         | Property office/district consistency; transaction/property consistency; wrong review office rejected; survey/valuation office matching                     |
| Officer identity     | Active designation and linked survey profile; wrong designation/profile rejected; account-linked designation changes protected                             |
| Surveys              | Completed survey updated area; finalized survey edits rejected; old historical survey preserved latest boundary; future completion rejected                |
| Historical records   | Valuation deletion, paid receipt edit, registered parcel edit/delete and finalized transaction operations rejected                                         |
| Applications         | Owner property auto-submission; transaction links existing application; service/type matching; rejection propagation                                       |
| Certificates         | Period snapshot included a released overlapping claim; linked application completed; reuse of finalized application rejected; issued certificate immutable |
| Referential deletion | District/owner referenced by other records could not be deleted; an unused district could be edited/deleted                                                |
| Digital copies       | Valid upload/download; content signature rejection; size/field limits; inaccessible downloads; a shared file survived another document's replacement       |
| ER representation    | All tables and FK endpoint pairs matched the SQL; nullable flags matched; partial ownership index remained visible in DDL                                  |

Input checks cover all editable metadata fields for required-value handling, incorrect primitive types, enum violations, protected fields and text limits, plus decimal boundaries, exact share precision, invalid UUIDs, malformed email, impossible/leap dates, arrays/null/string/numeric record bodies and Unicode. The API tests include negative, exponential, nonfinite, overlarge and overly precise numeric inputs. This is broad representative coverage; an unbounded set of all possible input strings cannot be exhaustively tested.

## Security controls and evidence

| Concern                         | Implemented control                                                                                           | Verified behaviour                                                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQL injection                   | Values bound through SQL placeholders; table/column identifiers restricted to server-owned metadata           | Injection strings failed login, produced no unrelated search results, stored literally, and could not become resource names/UUIDs; properties table remained intact |
| Stored XSS                      | React renders user values as text; no raw-HTML renderer for record values; CSP on built server                | Browser fixture displayed escaped markup without creating an image or executing its event handler                                                                   |
| Privilege escalation            | Server-side role checks and whitelisted writable fields                                                       | Owner could not approve transactions or create administrators; generic status/verification overrides rejected                                                       |
| Record-ID guessing              | Access predicates applied to list, individual records and documents                                           | Unrelated owner parcel/document requests returned inaccessible/not-found responses                                                                                  |
| Private-data disclosure         | Owner/bank field redaction and restricted private-field search                                                | Bank received no private identifiers/address/contact fields and could not infer hidden email through search                                                         |
| Account data                    | Password hashes excluded from account responses and live schema values                                        | Public account response contained no password hash; schema returned definitions rather than account records                                                         |
| Password storage                | Random 16-byte salt and scrypt-derived hash; constant-time comparison                                         | Same password generated different hashes; wrong and malformed hashes rejected safely                                                                                |
| Session tampering               | HMAC signature, eight-hour expiry, active-account lookup, HttpOnly/SameSite cookie                            | Forged/altered/malformed tokens rejected; disabled account immediately rejected; cookie flags verified                                                              |
| CSRF/cross-origin writes        | Required custom request header, origin allowlist and SameSite=Strict cookie                                   | Missing header and foreign Origin rejected with 403                                                                                                                 |
| Repeated guessing               | Login limit 30 attempts per 15 minutes per IP                                                                 | Repeated incorrect attempts reached 429                                                                                                                             |
| Request/upload resource limits  | JSON 100 KB, file 10 MB, authenticated API 240/minute, uploads 20/minute                                      | Oversized JSON/file rejected; rate settings reviewed; login throttling exercised                                                                                    |
| File execution/path traversal   | Generated storage key, basename validation, private storage, signature checks, authorized attachment download | Invalid file contents rejected; no anonymous download; attachment and nosniff headers present                                                                       |
| Mass assignment/prototype input | Unsupported/read-only fields rejected                                                                         | Privileged fields and `__proto__` input rejected                                                                                                                    |
| Spreadsheet formula injection   | CSV quotes plus neutralization of formula prefixes and leading whitespace/control characters                  | Unit cases covering `=`, `+`, `-`, `@`, tab/newline and quotes passed                                                                                               |
| Error leakage                   | Safe JSON error messages; no database query/stack in responses                                                | Malformed/oversized requests returned bounded safe errors; unique/FK violations translated to user-facing conflicts                                                 |
| History tampering               | Finalized-record guards; controlled ownership and append-only API audit endpoints                             | Generic ownership/audit writes blocked; edits to finalized records rejected                                                                                         |
| Dependency advisories           | Lockfile and npm audit                                                                                        | No known advisories reported in installed dependency tree at check time                                                                                             |

The installed dependency audit is a point-in-time advisory check. It is not a source-code penetration test or a guarantee that undisclosed vulnerabilities do not exist. The application security checks are automated regression cases plus focused browser/source review, not an independent security certification.

## Corrections included in the verified implementation

- Offices with parcel records cannot be moved to a different district and invalidate parcel relationships.
- A transaction party cannot be moved out of its finalized transaction.
- Account-linked officer designation changes cannot break the role/profile relationship.
- Field officers and reviewing/issuing registrars must match the relevant property office.
- Application service and related transaction type must agree.
- Certificate issuance cannot overwrite/reuse a finalized application.
- Transaction rejection updates open linked applications.
- Owner registration submission links its existing application instead of duplicating it.
- A backdated survey cannot overwrite newer boundaries.
- Upload replacement preserves files still referenced by another document.
- Malformed upload fields and oversized JSON receive safe errors.
- Bank/owner searches cannot use redacted private owner values.
- Money display retains paise; fractional shares display without floating-point formatting noise.
- CSV exports handle formula prefixes even with leading whitespace.

## Repeat the checks

```sh
npm ci
npm run setup
# Start CockroachDB and follow README initialization steps first.
npm test
npm run test:integration
npm run build
npm audit
```

The integration SQL user must be allowed to create/drop the suite's isolated databases. Tests use a separate API port 3101. The checked-in GitHub Actions workflow repeats unit/integration/build/advisory checks on pushes and pull requests with CockroachDB 25.4.0 in an isolated container. [The checkpoint's GitHub Actions run](https://github.com/Sai-2211/dbms_project/actions/runs/38046599242) completed successfully. This independently verified the tests, build and dependency audit on Linux with the CockroachDB container.

Desktop layout was inspected at 1440 × 1000 and mobile layout at 380 × 844. The dashboard and ER explorer kept the page within the mobile viewport; navigation and data tables use their own horizontal scrolling. Temporary viewport overrides were reset after checking. Screenshots are retained in `images/`.

## Limits of verification

No public production/TLS deployment, multi-node cluster failover, backup-restore drill, malware scanner, external identity/deed registry, payment gateway, real lending decision, large-scale load test or exhaustive fuzzing was exercised. Docker Compose was configuration-checked locally, but its local runtime was not started because the Docker daemon was unavailable. The native CockroachDB runtime was used for the actual local database checks.

The course dataset is fictional. A signed session remains valid until expiry or account deactivation even after a browser clears its cookie; there is no individual stolen-token revocation store. Audit rows remain modifiable by a privileged SQL administrator. Database and document-file persistence are separate, so process-crash orphan cleanup requires operational retention work. Files are checked by signatures rather than a complete document parser. Survey numbers do not establish globally unique physical parcels in this approved model. The architecture report documents these scope boundaries rather than claiming production readiness.

## Automated test inventory

The inventory below is generated from the successful final local test output. Several named tests contain multiple assertions/cases, including all 37 FK cases and all editable metadata fields.

### Unit checks

1. dates reject impossible days and accept leap days
2. shares preserve exact decimal values and reject excess precision
3. approval fields cannot be set by a generic edit
4. money and tax years are validated rather than silently rounded
5. bank and field officer roles have bounded write access
6. password hashes are salted and sessions reject tampering
7. all editable fields reject missing required values, wrong primitive types and protected keys
8. decimal boundary inputs reject infinities, negative, exponential and overlarge values
9. text trims whitespace and preserves Unicode and HTML as plain data
10. malformed password hashes and extra session token components fail safely
11. CSV exports neutralize formulas including leading whitespace and quote cells

### CockroachDB/API checks

1. foreign keys reject nonexistent land parcels
2. approval creates ownership history and a mutation atomically
3. a late audit failure rolls back every ownership and transaction update
4. two simultaneous sales cannot both consume the same ownership
5. a partial transfer retains joint ownership with exact shares
6. unverified deeds and mismatched shares block approval without partial updates
7. active encumbrances block ownership transfers
8. party records cannot be moved out of an approved transaction
9. bank access masks private owner details and rejects document access and writes
10. owner portal sees only its own parcels and protects unrelated record IDs
11. API status filters work and direct approval bypasses are rejected
12. digital uploads validate file contents and persist downloadable copies
13. the complete API registration workflow verifies a file and persists approved ownership
14. all other primary modules accept valid input and preserve historical records
15. certificate snapshots include overlapping released claims and cannot reuse finalized applications
16. office district and property transaction links reject inconsistent changes
17. officer designation and linked identity are enforced
18. SQL payloads are treated as data in login, search, writes, IDs and resource names
19. private owner values cannot be inferred through search and accounts stay administrator-only
20. audit records and ownership history cannot be written through public record endpoints
21. unauthenticated, forged and disabled-account sessions are rejected
22. foreign origins, malformed JSON and oversized bodies receive safe errors
23. invalid form values and protected fields are rejected at the API boundary
24. referenced records and finalized property data cannot be deleted or edited
25. transfer chronology, overselling and identical buyer/seller are blocked
26. inheritance and gift use their matching deeds and preserve exact ownership
27. registrars from another office and rejected linked applications cannot be approved
28. oversized, extra and unauthorized uploads are blocked, downloads require access
29. live ER metadata agrees with every table, FK and nullable reference in approved SQL
30. every one of the 37 foreign keys rejects a missing parent in the database
31. backdated completed surveys preserve the latest boundary and future completion is rejected
32. owner transaction submission links the existing application without creating a duplicate
33. account creation validates passwords, roles and required linked profiles
34. database checks and active ownership uniqueness hold outside the API
35. search resolves related names and bounds pagination
36. owners cannot approve registrations or set privileged fields
37. login throttling blocks repeated guessing attempts
38. replacing one document preserves a file still referenced by another document
39. survey and valuation officers cannot maintain a parcel from another registration office
