# Administrator and public-user access

The final signup and privacy implementation is described in [PUBLIC_SIGNUP.md](PUBLIC_SIGNUP.md). Visitors can create read-only accounts through **Public user → Create account**. Only signed-in administrators can create administrator/staff accounts through **User accounts**; multiple administrators are supported.

Public accounts see a limited directory of registered properties: survey number, type, area, district/state and registration-office/date/status. Locations, encumbrances, owner identities, documents, financial records, pending/rejected records, accounts, audits and schema are inaccessible. Public bulk export is removed. Signup does not verify ownership or grant access to private property records.

![Limited public directory](images/public-portal-desktop.png)

## Existing schema update

The earlier approved public-user feature changed only the two `users` checks:

1. `users_role_allowed` accepts `public_viewer` alongside the seven existing roles.
2. `users_role_profile` requires `public_viewer` to have null owner/officer links. Existing owner/officer profile rules remain enforced.

The database still has **18 tables and 37 foreign keys**. `server/schema.sql` defines a fresh database; `server/upgrade-public-role.ts` validates replacement checks before dropping the two generated legacy checks in existing databases. Running `npm run db:migrate` repeatedly preserves rows and passwords. Render's `npm run start:render` applies it automatically.

The subsequent signup and tighter privacy update makes **no additional schema changes**. It uses the existing account/audit tables and narrows public SQL projections and searches. A default-deny backend guard blocks public accounts from department APIs, and generic resource permissions give public users no read/write access. The dedicated public router accepts read requests only, with validated parameterized filters and a fixed registered-property projection.

## Setup and verification

For first administrator setup/recovery, follow [ACCOUNT_SETUP.md](ACCOUNT_SETUP.md). For Render Free, follow [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md). Signup requires no additional environment variables. Free upload bytes remain temporary; CockroachDB records are separate.

Current checks passed **25 unit and 54 CockroachDB/API tests**, the production build and a dependency audit with zero known vulnerabilities at check time. [The current report](PUBLIC_SIGNUP.md) lists authorization/privacy coverage and browser evidence; [VERIFICATION_REPORT.md](VERIFICATION_REPORT.md) retains the broader project checks. Earlier public CSV/encumbrance evidence describes features removed by the user's final privacy choice.
