# Administrator and public-user access

Implemented 12 October 2026, following approval to implement the proposed access feature and explain the changes afterward.

## What changed

The login screen has two choices: **Department / administrator** and **Public user**. There is no self-registration. Administrators create accounts through **User accounts → Add user account**; the new default choice is **Public user · read-only**. Existing department roles remain available for the project scenario. A linked owner account is different from a general public user and retains its existing property-specific privileges.

The server verifies the saved account role after checking its password. Choosing a login button or submitting a forged role does not change authorization. Selecting the wrong area produces a helpful message before a new session is issued. Returning sessions open the correct portal based on the role loaded from CockroachDB.

Public users see a dedicated directory with registered-property cards, a registered-property count, literal text search, district filters, safe details, pagination and export of the displayed page. Their interface has no data-entry controls, staff navigation, account tools or ER diagram.

![Public property directory](images/public-portal-desktop.png)

## Data visible to public accounts

| Visible                                       | Hidden / inaccessible                                                |
| --------------------------------------------- | -------------------------------------------------------------------- |
| Survey number, property type, area, location  | Owner names, identity numbers, contacts and private addresses        |
| District, state, registration-office name     | Officer identities and account details                               |
| Registration date and registered status       | Pending/rejected property records and applications                   |
| Boolean current encumbrance indicator         | Claimants, claim details, deeds and document downloads               |
| Internal property ID for opening safe details | Ownership/party history, valuations, tax payments, audits and schema |

The directory only includes `registration_status='registered'`. Counts and district options apply the same rule. Detail requests for pending, rejected or missing IDs return 404. The encumbrance indicator requires active status and a date range that includes today; it never returns the claim's identity/details. The interface explains that the overview is not a certificate or proof of title.

## Schema changes explained

Only the existing `users` checks changed:

1. The role check accepts `public_viewer` in addition to the seven existing roles.
2. The role/profile check permits `public_viewer` only when both `owner_id` and `officer_id` are null. Existing owner and officer requirements remain enforced.

The checks now have explicit names: `users_role_allowed` and `users_role_profile`. No table, column, foreign key or ER relationship was added. There are still **18 tables and 37 foreign keys**.

`server/schema.sql` contains the updated definition for a fresh database. `server/upgrade-public-role.ts` upgrades the original generated checks on an existing database. It adds and validates the replacement checks before removing the two known legacy checks. It can be repeated after completion or an interruption; rows, hashes and identities are untouched. `npm run db:migrate` runs the schema and upgrade. Render's `npm run start:render` runs it automatically before starting the server.

## Frontend and backend

`src/App.tsx` chooses between the existing workspace and `src/PublicPortal.tsx` after authentication. The public component only requests the public endpoints and uses the existing request helper and safe CSV-cell helper. It cancels stale list requests when filters change. Search/filter changes reset the page and clear the selected details. Details are fetched from the protected public detail endpoint.

After authentication, `server/index.ts` denies public accounts access to department APIs by default. `server/resources.ts` also gives this role no generic resource read/write permissions. `server/public-portal.ts` permits read requests only, binds every search/filter/ID value as a SQL parameter, restricts searchable columns, escapes LIKE metacharacters, validates UUIDs/query types and bounds pagination. It selects an explicit public projection rather than loading private rows and relying on hidden UI elements. Row counts and page contents share one database snapshot. Area is a decimal string to preserve precision.

| Endpoint                         | Purpose                                                         |
| -------------------------------- | --------------------------------------------------------------- |
| `GET /api/public/overview`       | Registered count, property-type counts and registered districts |
| `GET /api/public/properties`     | Filtered registered-property projection and pagination          |
| `GET /api/public/properties/:id` | One registered property's safe details                          |
| `GET /api/auth/me`               | Current account identity and role                               |
| `POST /api/auth/logout`          | Clear the session                                               |

Administrators can also access the public read APIs for inspection. Existing staff/owner roles use the department APIs. Account creation remains restricted to administrators. No new unauthenticated data endpoint or signup endpoint was introduced.

## Verification

**71 automated cases passed: 21 unit and 50 real CockroachDB/API tests.** The production build passed; the installed dependency audit reported zero known vulnerabilities at check time.

The eight added cases cover generic-resource denial; migration from the legacy checks twice with identical existing account rows and 37 retained foreign keys; administrator-only public-account creation; login-area mismatch and forged role input; registered-only lists/details/counts/districts; hidden-field searches and SQL payloads; department/data/file/schema/write denial; malformed query types and pagination; profile/role database checks; and date-sensitive encumbrance privacy. Several assertions run within each named case.

The existing suite still verifies all 37 missing-parent relationships, registration/transfer workflows, concurrent sales, rollback, exact joint ownership, document checks and the other security controls. This is representative regression coverage, not exhaustive enumeration of every possible input or an independent penetration test.

Browser checks verified administrator login and account role options, public login, search, district filtering, pagination, property details and CSV download. The downloaded filtered CSV had five registered Chennai rows and exactly ten safe export columns, without owner/document/private fields. Desktop at 1440×1000 and mobile at 390×844 had no horizontal overflow. Test data and credentials were fictional and local. No cloud account password was reset and no private cloud database was modified during these checks.

Evidence is retained in `docs/evidence/public-unit-tests.tap`, `public-integration-tests.tap`, `public-build.txt`, `public-dependency-audit.json` and `public-browser-export-check.json`.

## Activate on your existing Render Free service

Pushes to `main` can trigger automatic deployment. If it does not run, use **Manual Deploy → Deploy latest commit**. Keep the start command **`npm run start:render`** so the account migration runs. Check `/api/health`, sign in as administrator, then create a Public user account through the account menu. If administrator login is wrong, follow [ACCOUNT_SETUP.md](ACCOUNT_SETUP.md) from your Mac; Free has no Shell.

For the database network connection, use **Render service → Connect → Outbound** and add every displayed CIDR to **CockroachDB cluster → Networking → IP Allowlist**, with SQL client access. Add your Mac's Current Network separately for administrator setup. The full step-by-step instructions are in [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md).

On Free, use `UPLOAD_DIR=uploads`. Upload bytes are temporary and can disappear after restart/redeploy/idle shutdown; SQL records remain in external CockroachDB. Persistent cloud document storage has not been implemented in this update. The public portal does not offer document downloads.
