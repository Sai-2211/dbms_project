# LandLedger: verification and security report

**Latest automated and public-portal browser checks:** 12 October 2026; original full-workspace browser check: 10 October 2026.\
**Original browser/implementation checkpoint:** `a112d51`; latest automated checks include the Render configuration follow-up.\
**Database:** real CockroachDB 25.4.0, local single node  
**Runtime:** Node.js 22.19.0, macOS  
**Latest result:** 81 automated tests passed — 25 unit checks and 56 database/API checks. No failures or skipped tests in the final runs. The original checkpoint had 50 passing cases; subsequent additions cover Render readiness, administrator recovery and public-user access.

## Controlled training import follow-up

The administrator-only import loads the fixed 119-record workbook through existing validation and approval helpers in one serializable transaction. New checks cover role/CSRF/custom-payload rejection, conflict refusal without partial records/files, district reuse, preservation of existing accounts and unrelated records, exact ownership periods and workflow states, document downloads, sample recovery after temporary-file loss, refusal to recover a hash-mismatched attachment, certificate snapshots, audit actor and repeated-import idempotence. No schema change or account creation is performed.

Latest evidence: `evidence/training-import-unit.tap` (25 passed), `evidence/training-import-integration.tap` (56 passed), and `evidence/training-import-build.txt`. See [TRAINING_IMPORT.md](TRAINING_IMPORT.md). Earlier dated evidence below remains available.

## Public signup and privacy follow-up

The explicitly approved public signup creates only `public_viewer` accounts. Additional tests verify fixed role/profile values, salted hashes, secret-free audits, working sessions, username collision handling, rejected privilege overrides and reserved department names, password/confirmation bounds, malformed bodies, CSRF/origin rejection and independent signup throttling. Existing administrators can create additional administrators; visitors, public users, owners and bank accounts cannot. The public projection/search now omit locations and every encumbrance indicator, and public bulk export has been removed. Changing claim status/date cannot change the public property response. No schema change was needed.

Current evidence: `evidence/signup-unit-tests.tap` (25 passed), `evidence/signup-integration-tests.tap` (54 passed) and `evidence/signup-build.txt`. Public-directory export and encumbrance checks below describe the previous release and have been superseded by the tighter privacy policy. See [PUBLIC_SIGNUP.md](PUBLIC_SIGNUP.md).

## Public-user access follow-up (earlier release)

The two login areas and administrator-created `public_viewer` accounts were verified against a real local CockroachDB instance. Migration from the original two generated account checks succeeded twice with identical existing account rows and all 37 foreign keys retained. Public account creation, wrong-area login and forged role attempts were tested. Explicit public projections prevented hidden field disclosure/search; registered-only counts, district options and direct-ID details excluded pending/rejected records. Public requests to department APIs, files, accounts, schema and mutation routes returned 403. Query typing, bounds, SQL injection and current-date encumbrance indicators were exercised.

Earlier checkpoint evidence: `evidence/public-unit-tests.tap` (21 passed), `evidence/public-integration-tests.tap` (50 passed), `evidence/public-build.txt` (passed), `evidence/public-dependency-audit.json` (0 known vulnerabilities) and `evidence/public-browser-export-check.json`. Browser checks confirmed admin login/role options, public login, safe details, search, district filters, pagination and a downloaded five-row CSV with only approved public fields. Desktop (1440×1000) and mobile (390×844) had no horizontal overflow. Screenshots are in `images/public-portal-desktop.png` and `images/public-portal-mobile.png`. No private cloud account or database was changed by verification. See [PUBLIC_USER_ACCESS.md](PUBLIC_USER_ACCESS.md) for the implementation and schema explanation.

## Administrator access follow-up

On 11 October, the supplied public Render `/api/health` endpoint returned `{"status":"connected","database":"CockroachDB"}`. This confirms hosted database connectivity, but does not establish that an administrator has been created or verify a successful live login. No private cloud SQL credentials were supplied to or used by this verification.

The new `npm run db:admin` CLI privately prompts for the exact cloud URL and an application password, creates only the fixed administrator identity, and records an audit event atomically. The explicit `--reset-password` option can recover that administrator, including reactivating it. Existing passwords are otherwise preserved; identities belonging to another role cannot be elevated. No schema change, public signup, automatic password reset, or sample document creation was added. Cloud connection input requires verified TLS, and passwords are salted/hashed through the existing authentication helper.

Latest evidence: `evidence/admin-unit-tests.tap` (20 passed), `evidence/admin-integration-tests.tap` (43 passed), and `evidence/admin-build.txt` (TypeScript/frontend build passed). Three new unit cases exercise fixed identity, URL/TLS/placeholder validation and private password bounds. Two new database/API cases verify successful login after account creation, existing-password preservation, explicit recovery, secret-free audit records, prevention of role elevation and concurrent initialization without password replacement. A terminal smoke check confirmed connection/application-password prompts do not echo their input and connection failures display bounded messages without secrets. Its deliberately fictional connection was not used to modify the cloud database.

Actual administrator creation in the user's cloud database remains a step the user performs privately with the CLI. [ACCOUNT_SETUP.md](ACCOUNT_SETUP.md) documents it and the Render Free document-storage limitation.

## Verified results

| Check                                        | Result                                             | Evidence                                                                                                                        |
| -------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Unit validation/auth/export/deployment suite | 25 passed                                          | `npm test`; `evidence/signup-unit-tests.tap`                                                                                    |
| Isolated CockroachDB/API suite               | 56 passed                                          | `npm run test:integration`; `evidence/training-import-integration.tap`                                                             |
| TypeScript and frontend production build     | Passed                                             | `npm run build`                                                                                                                 |
| Installed dependency advisory audit          | 0 known vulnerabilities                            | `npm audit`, at verification time                                                                                               |
| Standalone built frontend/API smoke check    | Passed                                             | HTML and built script served; unauthorized records rejected; authenticated live schema returned                                 |
| Actual schema                                | 18 tables, 37 foreign keys                         | Catalog response and approved SQL comparison                                                                                    |
| Missing-parent rejection                     | All 37 FK cases passed                             | Deliberate invalid-parent updates in the isolated test database                                                                 |
| Browser record navigation                    | All 12 primary tabs loaded their own database rows | 24 properties, 9 owners, 4 offices and populated examples in other modules                                                      |
| Persistent browser entry                     | Passed                                             | Created fictional district, reloaded, found saved row                                                                           |
| Stored HTML/Unicode rendering                | Passed                                             | `<img ... onerror=...>` displayed literally; table contained zero image elements and escaped markup; Tamil text retained        |
| Relationship controls                        | Passed                                             | Selecting Chennai reduced the office dropdown to Chennai Central Registry                                                       |
| Pagination/status filter                     | Passed                                             | Property page two displayed records 11–20; Pending filter showed four pending transactions                                      |
| ER interactions/export                       | Passed                                             | Table selection, related-table filtering, fit view, inspection and JSON download; export verified as 18 tables/37 relationships |
| Formatting/whitespace consistency            | Passed                                             | Prettier and `git diff --check`                                                                                                 |

The two fictional district records created through the browser were removed through the API after checking them. Automated integration tests never modify the main application database: each run creates its own `landledger_test_*` database, installs the approved schema, launches a separate API and private upload directory, and drops only those test resources afterward.

## Render readiness follow-up

The production build passed again (`evidence/render-build.txt`), and npm reported zero known dependency vulnerabilities (`evidence/render-dependency-audit.txt`). `render.yaml` validated against [Render's official JSON Schema](https://render.com/schema/render.yaml.json); the result is retained in `evidence/render-blueprint-validation.json`. Temporary schema-validation tools were installed outside the repository and are not application dependencies.

New configuration cases verify local loopback defaults, Render's assigned HTTPS origin/port, one trusted ingress hop, custom-domain overrides, required production TLS, and rejection of malformed origins/ports/password placeholders without exposing secrets. The Render demo wrapper requires an explicit private password and leaves the parent web service's production mode unchanged.

Two new integration cases exercise real local CockroachDB and separate subprocesses. The proxy case confirms a throttled client cannot evade the limit by prepending a spoofed forwarded address, while another client can sign in; foreign-origin writes remain blocked. The bootstrap case creates 24 fictional properties, seven privately password-hashed accounts and readable sample PDFs, confirms repeat initialization leaves account hashes unchanged, and confirms an unrelated non-empty registry is refused. Normal production seeding remains blocked. These tests create and remove only disposable test databases and document directories.

The approved SQL schema has not changed. No Render resources were created, and no public HTTPS endpoint, actual Render proxy topology, cloud password, cloud migration or persistent-disk redeploy was tested. Follow [the deployment guide](RENDER_DEPLOYMENT.md) to perform those final platform checks after creating the service.

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

The integration SQL user must be allowed to create/drop the suite's isolated databases. Tests use separate API ports 3101 and 3102. The checked-in GitHub Actions workflow repeats unit/integration/build/advisory checks on pushes and pull requests with CockroachDB 25.4.0 in an isolated container. [The original checkpoint's GitHub Actions run](https://github.com/Sai-2211/dbms_project/actions/runs/38046599242) completed successfully. This independently verified that checkpoint's tests, build and dependency audit on Linux with the CockroachDB container.

Desktop layout was inspected at 1440 × 1000 and mobile layout at 380 × 844. The dashboard and ER explorer kept the page within the mobile viewport; navigation and data tables use their own horizontal scrolling. Temporary viewport overrides were reset after checking. Screenshots are retained in `images/`.

## Limits of verification

No public production/TLS deployment, multi-node cluster failover, backup-restore drill, malware scanner, external identity/deed registry, payment gateway, real lending decision, large-scale load test or exhaustive fuzzing was exercised. Docker Compose was configuration-checked locally, but its local runtime was not started because the Docker daemon was unavailable. The native CockroachDB runtime was used for the actual local database checks.

The course dataset is fictional. A signed session remains valid until expiry or account deactivation even after a browser clears its cookie; there is no individual stolen-token revocation store. Audit rows remain modifiable by a privileged SQL administrator. Database and document-file persistence are separate, so process-crash orphan cleanup requires operational retention work. Files are checked by signatures rather than a complete document parser. Survey numbers do not establish globally unique physical parcels in this approved model. The architecture report documents these scope boundaries rather than claiming production readiness.

## Automated test inventory

The inventory combines the original successful local output and the Render follow-up output. Several named tests contain multiple assertions/cases, including all 37 FK cases and all editable metadata fields. Entries are grouped for readability rather than execution order.

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
12. local configuration remains loopback-only and does not trust proxy headers
13. Render uses its assigned HTTPS origin, ingress hop and injected port
14. custom domain and upload directory override Render defaults
15. production rejects insecure database TLS and non-HTTPS website origins
16. configuration errors reject malformed origins, ports and SQL password placeholders without leaking secrets
17. Render demo initialization requires an explicit private password and Render environment
18. administrator setup uses a fixed identity and requires a verified cloud URL
19. administrator setup rejects malformed connections and placeholders without leaking SQL passwords
20. administrator setup requires a private bounded application password

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
40. Render proxy mode keeps client login limits separate and rejects spoofed outer forwarded addresses
41. Render demo bootstrap creates private accounts and document files, is idempotent, and refuses unrelated records
42. cloud administrator setup creates an audited login, preserves existing passwords unless reset, and recovers access
43. administrator setup does not elevate another role or replace an account after concurrent creation

### Public-user additions

- Unit: public users have no generic department-resource read/write permissions.
- Integration: repeatable legacy account-check migration preserves existing rows and foreign keys.
- Integration: administrator-created accounts and no login role spoofing.
- Integration: registered-only public projections, search, counts, safe district options and details.
- Integration: private department endpoints, file downloads, schema and all mutations denied.
- Integration: bounded, typed public filters and pagination; hidden filter keys rejected.
- Integration: database rejects unknown roles and public accounts linked to private profiles.
- Integration: public details exclude encumbrance information regardless of claim changes (supersedes the earlier indicator case).

### Signup additions

- Four unit cases cover normalization, Unicode passwords, malformed/privileged payloads, reserved usernames, bounds and confirmation.
- Integration: signup creates a hashed read-only account, secret-free audit and working session; duplicates do not replace credentials.
- Integration: invalid/privileged payloads and foreign-origin/missing-header requests make no account changes.
- Integration: only authenticated existing administrators can create additional administrator/staff accounts.
- Integration: signup throttling is independent of sign-in.
- The earlier claim-indicator case now verifies that claim changes are entirely absent from public responses and that location/claim filter keys are rejected.
