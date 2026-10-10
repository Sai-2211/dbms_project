# LandLedger

A React web application for the **Digital Land Registration and Property Management System** DBMS project. Forms write to a real **CockroachDB** database; the dashboard and record views read from the same database.

## Included

- Home dashboard: parcel counts, owners, pending transactions, recorded tax receipts, property mix, district distribution and audit activity.
- Exactly **12 primary tabs**: Properties, Owners, Districts, Offices, Officers, Transactions, Documents, Surveys, Valuations, Tax Payments, Encumbrances and Mutations.
- Search, status filters, pagination, record details, entry forms and current-page CSV export.
- Initial registration, sale, inheritance and gift transactions with joint ownership shares and dated ownership history.
- Deed uploads and verification; a sub-registrar approves transactions.
- Surveys, boundary updates, valuation history, tax receipt recording and encumbrance claims.
- Service applications, generated encumbrance-certificate snapshots, user accounts and an audit trail through the workspace menu.
- Seven access roles: administrator, owner, survey officer, valuation officer, sub-registrar, bank verifier and auditor.
- Serializable transaction retries, foreign keys, validation, protected finalized records, password hashing and HTTP-only session cookies.
- Separate interactive **ER diagram** tab: 18 tables and 37 foreign-key relationships read from the live database, with draggable tables, cardinalities, column/constraint inspection, related-table filtering and JSON export.

![LandLedger dashboard](docs/images/dashboard.png)

This is a student demonstration application. It does not perform real tax payments, mortgage approvals or legal registration. All seeded records and example documents are fictional. Amounts use INR; land areas use square metres.

## Stack

- React + TypeScript + Vite
- Node.js 22 + Express
- CockroachDB 25.4.0, with the `pg` PostgreSQL-compatible driver
- Local private file storage for documents; document metadata/checksums are in CockroachDB

## Run locally

Requirements: **Node.js 22.19+**, npm, and either Docker Compose or an installed CockroachDB binary. Node 24 is also suitable. The versioned Docker configuration provides the tested database version.

```sh
git clone https://github.com/Sai-2211/dbms_project.git
cd dbms_project
npm ci
npm run setup
docker compose up -d
```

Wait for the database to become healthy and the `db-init` service to exit successfully:

```sh
docker compose ps -a
npm run db:migrate
npm run db:seed
npm run dev
```

Open **http://127.0.0.1:5173**. The API runs on port 3001; CockroachDB SQL uses port 26257. Its development DB console is available at http://127.0.0.1:8080.

`npm run setup` creates a private, ignored `.env` file with a random session secret. It preserves an existing `.env`. The default database URL is for a loopback-only, insecure **local demonstration** database. Database data persists in a Docker volume. Document files persist in the ignored `uploads/` directory.

### Without Docker

Use an official CockroachDB binary, then keep this process running:

```sh
cockroach start-single-node --insecure --listen-addr=127.0.0.1:26257 --http-addr=127.0.0.1:8080 --store=./work/cockroach-data
```

In another terminal:

```sh
cockroach sql --insecure --host=127.0.0.1:26257 --execute='CREATE DATABASE IF NOT EXISTS landledger;'
npm run db:migrate
npm run db:seed
npm run dev
```

### Demo sign-in

All seven seeded accounts use **`LandLedger@2026`**, unless `DEMO_ADMIN_PASSWORD` was changed before the first seed.

| Username                     | Role                                                                       |
| ---------------------------- | -------------------------------------------------------------------------- |
| `admin@landledger.local`     | Administrator; all twelve modules                                          |
| `owner@landledger.local`     | Owner portal; own parcels and applications                                 |
| `registrar@landledger.local` | Sub-registrar for Chennai Central Registry                                 |
| `surveyor@landledger.local`  | Survey officer                                                             |
| `valuer@landledger.local`    | Valuation officer                                                          |
| `bank@landledger.local`      | Read-only ownership/encumbrance verification; private owner details hidden |
| `auditor@landledger.local`   | Read-only records and audit trail                                          |

The seed creates 24 fictional properties, nine owners, four districts and examples across the primary modules. Running it again leaves existing demonstration data unchanged. It refuses a non-empty database containing unrelated records and is disabled when `NODE_ENV=production`.

## Demonstrate the project

Start with [the step-by-step demo guide](docs/DEMO_GUIDE.md). It covers a new registration, a transfer, verification, joint ownership, rollback, role access and the ER explorer. The dashboard is populated from database queries, rather than hardcoded counts.

Read [the detailed architecture report](docs/ARCHITECTURE.md) for the frontend, backend, database connection and transfer workflow. [The verification report](docs/VERIFICATION_REPORT.md) contains all 50 passing test cases, security checks, browser evidence and practical limitations.

## Schema approval

The supplied scan omitted entity attribute descriptions 4–7. The user approved reconstructing Offices, Officers, Transactions and Documents, adding foreign keys/validation, and adding six supporting tables. The approved design has **18 database tables** and **12 primary navigation tabs**. See [the retained approval proposal](docs/SCHEMA_APPROVAL.md) and [the ER diagram](docs/SCHEMA.md).

`server/schema.sql` creates the initial schema without dropping existing tables. Re-running it is safe for the initial design; it is not an automatic upgrade mechanism for future schema revisions. Further schema changes require user approval.

## Checks

```sh
npm test
npm run test:integration
npm run build
```

The integration tests require a reachable CockroachDB instance and a development SQL user allowed to create databases. Each run creates its own `landledger_test_*` database and removes only that test database afterward. The tests exercise all 37 foreign keys, full rollback, conflicting transfers, joint ownership, document checks, role access, status filters, SQL injection, escaped HTML, upload/download, certificates, surveys and live schema accuracy. The final suites passed 11 unit and 39 integration tests. GitHub Actions repeats the checks on each push and pull request.

The application never substitutes SQLite, PostgreSQL, browser storage or mock data when CockroachDB is unavailable. The interface displays a connection or operation error.

### Serve the built app

```sh
npm run build
npm start
```

Open **http://127.0.0.1:3001**. The API serves the built frontend. Development mode allows this loopback origin as well as the Vite origin. `npm start` requires the project's installed dependencies because the backend runs TypeScript through `tsx`.

## Configuration

| Variable              | Purpose                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `DATABASE_URL`        | CockroachDB connection URL. Use verified TLS for a cloud/secure cluster.                      |
| `SESSION_SECRET`      | Random signing secret, at least 32 characters. Never put it in frontend code.                 |
| `PORT`                | API port; default 3001.                                                                       |
| `HOST`                | API bind host; default `127.0.0.1`. Only change for a controlled container/server deployment. |
| `APP_ORIGIN`          | Frontend origin for request checks. Default `http://127.0.0.1:5173`.                          |
| `UPLOAD_DIR`          | Persistent private document directory; default `uploads`.                                     |
| `DEMO_ADMIN_PASSWORD` | Local sample-account password, used during first seed only.                                   |
| `NODE_ENV`            | Set to `production` only with HTTPS, secure database credentials, and real accounts.          |

Uploaded files are PDF/PNG/JPEG, up to 10 MB, with a UUID storage key and SHA-256 checksum. Downloads require an authorized session. Finalized documents cannot be replaced. Keep both database backups and document-directory backups together.

## Project structure

```text
src/                  React interface and API client
server/schema.sql     Approved CockroachDB tables, constraints and indexes
server/index.ts       API routes, file handling and session authorization
server/business.ts    Ownership approval, validation and audit operations
server/resources.ts   Form metadata and module permissions
server/db.ts          Database connection and serializable retry wrapper
server/catalog.ts     Live column, key and relationship metadata for the ER tab
src/SchemaExplorer.tsx Interactive ER diagram and schema inspector
server/seed.ts        Fictional demonstration records
tests/                Unit and isolated database/API tests
docs/                 ER diagram, approval record and professor/demo guides
docker-compose.yml    Loopback-only persistent development CockroachDB
```

## Scope and deployment limits

The single-node setup demonstrates relational integrity and atomic, serializable transactions. It **does not demonstrate node-failure resilience**; that needs a correctly configured multi-node deployment and a separate failover demonstration. See [the database justification](docs/DATABASE_JUSTIFICATION.md).

The audit trail is append-only through the application API. A database administrator can still modify database rows; it is not a cryptographically immutable legal ledger. Bank verification is a read-only view, not a lending decision. A certificate captures the claims currently stored for its requested period, including released claims that overlap the period; it does not certify the completeness of external government records.

Before public production use, configure TLS and least-privilege database credentials, replace demonstration accounts, establish backup/recovery and file retention, and review the application against the actual department's requirements. This repository does not deploy or expose the user's records publicly.
