# LandLedger

A **Digital Land Registration and Property Management System** built with React, Express and CockroachDB. Forms save related records to the database; dashboards, tables, ownership history and an interactive ER explorer display the stored data.

[Hosted application](https://dbms-project-dph6.onrender.com/) · [Architecture](docs/ARCHITECTURE.md) · [Database justification](docs/DATABASE_JUSTIFICATION.md)

![Hosted training registry](docs/images/dashboard.png)

## Features

- Home dashboard and **12 primary tabs**: Properties, Owners, Districts, Offices, Officers, Transactions, Documents, Surveys, Valuations, Tax Payments, Encumbrances and Mutations.
- Search, status filters, pagination, record details and department CSV export.
- Registration, sale, gift and inheritance workflows with joint ownership, exact shares and dated ownership history.
- Uploaded deeds, document verification and sub-registrar approval.
- Survey/boundary history, valuations, taxes, claims, service applications and certificate snapshots.
- Administrator account creation and public self-signup, with server-enforced roles and a limited public directory.
- Administrator-only fictional dataset import, duplicate prevention and recovery of known sample PDF attachments.
- A separate interactive **ER diagram** built from the live database: **18 tables and 37 foreign keys**, with cardinalities, draggable tables, constraint inspection, filtering and schema JSON export.

This is a course demonstration. Records and sample attachments are fictional; the app does not perform real legal registration, tax payments or lending decisions. Money uses INR and areas use square metres.

## Stack

React 19, TypeScript and Vite on the frontend; Node.js 22 and Express 5 on the backend; CockroachDB 25.4.0 through the PostgreSQL-compatible `pg` driver. Documents have private file storage and SHA-256 metadata. The app uses serializable transactions, parameterized SQL, foreign keys, validation, salted password hashes and signed HTTP-only session cookies.

## Local setup

Install Node.js **22.19+**, npm and Docker Compose. Node 24 is also supported by the current dependencies.

```sh
git clone https://github.com/Sai-2211/dbms_project.git
cd dbms_project
npm ci
npm run setup
docker compose up -d
docker compose ps -a
```

Wait for `db` to become healthy and `db-init` to exit successfully, then run:

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

Open **http://127.0.0.1:5173**. Express runs on port 3001, CockroachDB SQL on 26257 and the local database console on 8080. Docker ports are bound to loopback. `npm run setup` creates an ignored `.env` with a random session secret and preserves an existing configuration. Database data persists in a Docker volume; local document files use the ignored `uploads/` directory.

### Without Docker

Install an official CockroachDB binary and keep it running:

```sh
cockroach start-single-node --insecure --listen-addr=127.0.0.1:26257 --http-addr=127.0.0.1:8080 --store=./work/cockroach-data
```

In another terminal, create the local database and follow the migration/seed/dev steps above:

```sh
cockroach sql --insecure --host=127.0.0.1:26257 --execute='CREATE DATABASE IF NOT EXISTS landledger;'
```

### Local demo accounts

After `npm run db:seed`, these seven accounts use **`LandLedger@2026`**, unless `DEMO_ADMIN_PASSWORD` was changed before the first seed:

| Username                     | Role              |
| ---------------------------- | ----------------- |
| `admin@landledger.local`     | Administrator     |
| `owner@landledger.local`     | Owner             |
| `registrar@landledger.local` | Sub-registrar     |
| `surveyor@landledger.local`  | Survey officer    |
| `valuer@landledger.local`    | Valuation officer |
| `bank@landledger.local`      | Bank verifier     |
| `auditor@landledger.local`   | Auditor           |

Choose **Department / administrator** for these accounts. The seed creates 24 fictional properties, nine owners and four districts. It refuses unrelated non-empty registries and is disabled in production. Running it again on its existing demo registry does not replace records or passwords. Local and hosted databases are separate; the hosted administrator uses its privately configured password.

## Accounts and permissions

Use **Department / administrator** for administrator, owner and staff accounts; use **Public user** for read-only directory accounts. Permissions always come from the database role, not the selected login button. Password fields have Show/Hide controls and are hidden initially.

Administrators open their username menu → **User accounts** to list accounts and create additional administrator/public/owner/staff accounts. Owner accounts require their matching profile. Staff accounts can create an officer profile and office link atomically, or link an existing officer without an active login. Administrators can also repair profile links and delete login access. Audit-linked identities are retained as inactive history; accounts without audit references are removed. Role editing, reactivation and in-app password resets are not available. [Role access and workflows](docs/ROLE_ACCESS.md) documents office scopes, officer duties and dashboards.

Visitors can choose **Public user → Create account**. Signup creates only `public_viewer` accounts, validates confirmation and rejects role/profile overrides. **All usernames ending in `@landledger.local` are reserved for administrator-created or demo accounts**; those existing accounts can sign in normally. Use another username or your own email for public signup.

Public accounts see registered parcels' survey number, type, area, district/state and registration office/date/status. Precise locations, owner identities/contact details, documents, claims, finances, pending/rejected parcels, accounts, audits and schema are hidden; public bulk export is unavailable. [Public signup and privacy](docs/PUBLIC_SIGNUP.md) explains the policy and implementation.

## Sample data and demonstrations

Choose one dataset approach for the database you intend to use:

- **Local seed:** `npm run db:seed` initializes a separate empty local demo registry with seven role accounts.
- **Controlled import:** signed-in administrator → username menu → **Load training records**. It loads 119 specified records, creates 14 ownership-history and five transfer-mutation rows, and adds audit events. Existing accounts are preserved and repeated imports do not add duplicates. See [the import guide](docs/TRAINING_IMPORT.md).
- **Manual practice:** [the copy-and-paste workbook](docs/MANUAL_DATA_ENTRY.md) provides dependency order, dropdown references, approval steps and expected results. Its [sample PDF](docs/Fictional-Training-Upload.pdf) is a training placeholder, not a legal deed or identity document.

Do not manually re-enter the same training identifiers after importing them. For a short demonstration, follow [DEMO_GUIDE.md](docs/DEMO_GUIDE.md).

## Hosting and administrator setup

Deploy as **one Node Web Service**: Express serves the built React app and API from the same origin, with CockroachDB Cloud as the external database.

| Render setting | Value                                   |
| -------------- | --------------------------------------- |
| Build          | `npm ci --include=dev && npm run build` |
| Start          | `npm run start:render`                  |
| Health check   | `/api/health`                           |
| Runtime        | Node 22                                 |

[RENDER_DEPLOYMENT.md](docs/RENDER_DEPLOYMENT.md) covers environment variables, outbound IP allowlisting, Free limitations and the optional paid Blueprint. The root `render.yaml` includes a paid persistent disk; use the manual Free-service instructions if you need a free deployment.

For a fresh hosted administrator, run `npm run db:admin` locally and privately enter the **same database URL as Render** and a new application password. To recover an existing administrator, use `npm run db:admin -- --reset-password`. Sign in as `admin@landledger.local`. Setting `DEMO_ADMIN_PASSWORD` does not reset an existing login. See [ACCOUNT_SETUP.md](docs/ACCOUNT_SETUP.md).

Render Free document storage is temporary. The versioned training PDF can be recovered on authorized download after a restart, but other uploaded documents need persistent storage. CockroachDB records remain in the external database.

## Configuration

| Variable              | Purpose                                                                        |
| --------------------- | ------------------------------------------------------------------------------ |
| `DATABASE_URL`        | Private CockroachDB connection URL; production requires `sslmode=verify-full`. |
| `SESSION_SECRET`      | Random signing secret of at least 32 characters; server-side only.             |
| `PORT`                | API port, default 3001; injected by Render.                                    |
| `HOST`                | Default `127.0.0.1` locally and `0.0.0.0` on Render.                           |
| `APP_ORIGIN`          | Exact allowed frontend origin; uses Render's assigned HTTPS URL there.         |
| `UPLOAD_DIR`          | Private document directory, default `uploads`.                                 |
| `DEMO_ADMIN_PASSWORD` | Password for first sample seed/bootstrap only.                                 |
| `NODE_ENV`            | `development` locally; `production` for HTTPS deployment.                      |

Use [.env.example](.env.example) as a reference. Real `.env` files, credentials, uploads, dependencies and build output are ignored by Git. Share the repository, not a copy of your private local configuration. Do not put secrets in frontend `VITE_*` variables.

## Verification

```sh
npm test
npm run test:integration
npm run build
npm audit --audit-level=high
```

The latest verified suites have **25 unit tests and 62 CockroachDB/API integration tests**. Integration tests create and remove only their own disposable `landledger_test_*` databases, using a development SQL user with database-creation permission. Use a local/test CockroachDB instance for these checks. Tests cover relationships, rollback, conflicting transfers, ownership shares, uploads, role/privacy controls, injection inputs, migration, administrator recovery and training import. GitHub Actions repeats unit, integration, build and dependency checks on pushes and pull requests. TypeScript also rejects unused imports and parameters.

The [verification report](docs/VERIFICATION_REPORT.md) describes coverage and practical limits. The app displays an error when CockroachDB is unavailable; it never substitutes another database or browser storage.

To serve the built app locally:

```sh
npm run build
npm start
```

Open http://127.0.0.1:3001. The backend runs TypeScript through `tsx`, so installed dependencies are required.

## Repository guide

| Location                              | Purpose                                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/`                                | React workspace, public portal, ER explorer, styles and API client                                 |
| `server/`                             | API, authentication, validation, business workflows, SQL schema, migrations and setup/import tools |
| `shared/`                             | Shared public-property and schema contracts                                                        |
| `tests/`                              | Unit and isolated database/API regression tests                                                    |
| `scripts/setup.mjs`                   | Safe local environment initialization                                                              |
| `docs/`                               | Architecture, schema, database justification, setup, demo and privacy guides                       |
| `docs/data/manual-entry-records.json` | Runtime input for the controlled training importer                                                 |
| `docs/Fictional-Training-Upload.pdf`  | Runtime sample upload/recovery asset                                                               |
| `.github/workflows/ci.yml`            | Automated checks                                                                                   |
| `docker-compose.yml`                  | Persistent local CockroachDB                                                                       |
| `render.yaml`                         | Optional paid Render deployment with private disk                                                  |

The JSON dataset and sample PDF in `docs/` are **runtime assets**, not disposable reports.

## Schema and scope

[SCHEMA.md](docs/SCHEMA.md) explains the 18-table/37-relationship model; [SCHEMA_APPROVAL.md](docs/SCHEMA_APPROVAL.md) retains the approved design decisions. `db:migrate` creates missing tables and applies the repeatable public-role and bank-profile constraint upgrade without replacing records or passwords. Further schema changes require project-owner approval.

The single-node demonstration proves relational integrity and serializable workflows, not multi-node failover. The course app has no external government verification, real payment processing, GIS or MFA. Its audit API is append-only, but a privileged SQL administrator can modify rows. Coordinated database/file backups and an operational security review are needed for real departmental use.
