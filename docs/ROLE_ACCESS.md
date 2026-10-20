# Role access and connected workflows

Updated for the requested officer/account separation on 20 October 2026. The API enforces the same permissions used by navigation, record drawers, searches, lookup lists, downloads, counts and dashboard work queues.

| Role              | Read scope                                                                                                                       | Permitted work                                                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Administrator     | All offices, registry records, accounts, audits and schema                                                                       | Manage profiles/accounts; perform every existing departmental workflow; assign officers; retain the existing finalized-record safeguards                                       |
| Sub-registrar     | Their active officer profile’s registration office; relevant owners and all parcel records in that office                        | Registrations/transfers, deed verification, applications, certificates, mutations, taxes and claims; cannot manage staff/accounts or view global audit/schema                  |
| Survey officer    | Their assigned surveys and their parcels, own officer profile, office and district                                               | Record/complete their own assigned surveys; completion maintains the latest parcel boundary; cannot assign themselves an unrelated parcel or complete another officer’s survey |
| Valuation officer | Office parcels, office survey context, their own valuation records and officer profile                                           | Record their own finalized assessments for office parcels; cannot edit another officer’s valuations or approve a registration                                                  |
| Bank verifier     | Their office’s parcel/title information, ownership, claims, certificates and own profile                                         | Read-only verification; private owner identity/contact fields and digital documents are unavailable                                                                            |
| Auditor           | Their office’s registry records and audit events; owner names with private identity/contact values removed                       | Read-only inspection, including authorized digital documents; cannot approve or change records/accounts                                                                        |
| Owner             | Their property/application context; reference offices/districts and a redacted owner directory needed to select transfer parties | Submit pending property/transaction/document/application records; track progress; cannot approve records or access staff, audits or schema                                     |
| Public user       | Dedicated projection of registered parcels only                                                                                  | Read-only basic public property directory; no department endpoints                                                                                                             |

The database role determines access. Choosing a different login area cannot elevate permissions. A missing, inactive or mismatched officer profile never grants global access. Existing unlinked bank accounts can sign in to an empty workspace explaining that administrator linkage is required; new bank accounts require an active bank officer profile.

## Approval dependencies

- A registrar acts using their own linked profile and office. Administrators select an active registrar in the parcel’s office to keep the existing officer foreign keys and approval provenance meaningful; the acting administrator is also recorded in the audit trail.
- Transfer/registration approval still requires the correct verified digital deed and valid transaction parties/shares. Ownership history, mutations, applications and audit entries commit atomically.
- Certificate issuance still requires the correct office and application, and preserves a dated claim snapshot.
- Survey completion is available only to administrators and the assigned survey officer. A new survey preserves older completed measurements.
- A valuation is a finalized assessment when saved. The schema has no draft/approval status for valuations; its dashboard lists office parcels with no recorded valuation and exposes the officer’s valuation history.
- Bank and audit accounts have no approval powers in the existing model. The app does not fabricate lending decisions or audit sign-off workflows.

## Dashboards

Each workspace names the role and linked officer/office, presents authorized metrics, and exposes relevant actions. Queues list up to eight oldest records and the total pending count. Registrars/admin see pending transactions, documents, mutations and applications; surveyors see assigned scheduled surveys; valuers see parcels without an assessment. Owners track their submitted processes. Bank/audit workspaces expose their authorized read-only records rather than an approval inbox. Admin also has counts for every registry module.

All queries use the same row scopes as record APIs. Audit events capture the office at action time so deletion history remains visible to that office’s auditor. Legacy audit events fall back to the current affected record’s office when available; old deleted events without jurisdiction metadata remain administrator-only.

## Accounts

Administrators manage **User accounts** from the username menu. The list shows the linked owner/officer, office and officer contact fields. The uncovered-officer list starts creation directly from the existing profile. **Link profile** repairs an existing active account without replacing its username, password or role. Active officer/owner profiles can have only one active account through the account APIs, enforced within serializable transactions and profile locks.

**Delete account** immediately revokes sign-in and existing cookie access. An account that has never acted in an audit event is removed. An account referenced by audit history is retained as inactive with an unusable replacement credential; audit records and registry history remain intact. The signed-in administrator cannot delete their own account.

The repeatable migration expands the existing officer designation check to include `bank_verifier` and permits a bank account’s existing officer foreign key. It preserves all tables, rows, passwords and 37 foreign keys. It does not infer an office for legacy bank accounts.

## Controlled officer provisioning

`npm run db:officers` previews missing accounts against the configured database without changing records. `--hosted` uses `HOSTED_DATABASE_URL` from the ignored `.env` file and requires verified TLS. Use `--apply` only when ready to create accounts; set `OFFICER_PASSWORD_SUFFIX` privately to supply the requested demonstration password pattern. New passwords start with the numbered username’s first letter capitalized, followed by the suffix. Password values are never printed in the report or audit log.

Existing numbered prefixes are reused, occupied usernames are skipped, and existing accounts/passwords/contact fields are preserved. A unique unlinked account can be matched only when exactly one profile of its role lacks an account; ambiguous matches fail without committing account changes. The report identifies accounts that still need officer profiles. This command never invents contact details or assigns an ambiguous office.
