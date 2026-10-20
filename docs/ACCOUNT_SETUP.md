# First administrator login on Render Free

Deploying the application creates its tables, but does not create user accounts. Setting `DEMO_ADMIN_PASSWORD` in Render does not create or update a password by itself. On Render Free, initialize the administrator from your own Mac because that plan has no Shell access.

This command uses the existing `users` and `audit_events` tables. It creates **only the administrator account**, not demo parcels, staff profiles, sample PDFs or other records. The administrator command itself makes no schema changes; deployment separately applies the approved public-user role upgrade. Existing public and private record data are left intact.

## Run the setup

1. In CockroachDB Cloud, select your cluster, open **Networking → IP Allowlist**, and add **Current Network** so your Mac can connect. Keep the Render outbound ranges too.
2. In VS Code, open your local `dbms_project` repository folder and open **Terminal → New Terminal**. Run:

   ```sh
   git pull origin main
   npm ci
   npm run db:admin
   ```

3. At **Paste DATABASE_URL from Render (hidden)**, paste the exact complete value saved in your Render service, including the SQL password and `sslmode=verify-full`. Press Enter. Pasted characters are deliberately hidden. The command shows the destination host and database name, without the SQL password, so you can check it is the intended database.
4. Choose and confirm a private **application login password** of 12–128 characters. These entries are hidden too. This password can be different from the SQL password; it is the password you will type on the website. The command does not read `DEMO_ADMIN_PASSWORD` automatically.
5. When **Administrator created** appears, sign in to the hosted website using:

   - Username: `admin@landledger.local`
   - Password: the application password you just entered in the terminal.

No deployment or restart is required for the account to become available: this command writes to the same CockroachDB database the site reads.

## Recover an existing administrator

If the command reports **Administrator already exists**, its current password was deliberately left unchanged. To replace that password, run:

```sh
npm run db:admin -- --reset-password
```

Enter the same cloud URL and choose/confirm a new application password. This explicit recovery command replaces the fixed administrator's password and reactivates that account if it exists; it creates the account if it is missing. It does not replace any other accounts or elevate a username that belongs to another role. The creation/reset is recorded in the application audit trail without storing the password in the audit entry.

Passwords are stored as salted scrypt hashes using the application's existing authentication helper. Secrets are not printed, placed in command arguments, or written to a configuration file by the setup command. Connection URLs must identify a database and use verified TLS. Only CockroachDB is accepted. The existing SQL user must have permission to read/write `users` and insert `audit_events`.

The existing session system does not revoke individual already-issued tokens on password change; recovery replaces the credential used for future sign-ins. Account deactivation remains the mechanism for rejecting an existing account's sessions.

## Troubleshooting

| Symptom                              | Check                                                                                                                                                |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nothing appears while pasting/typing | Secret input is hidden. Paste/type and press Enter.                                                                                                  |
| Cloud connection fails               | Mac's Current Network allowlist entry, full URL, URL-encoded SQL password, TLS and cluster availability.                                             |
| Missing application tables           | The setup URL must match Render's `DATABASE_URL`, and Render's migration must have succeeded.                                                        |
| Wrong SQL username/password          | Use the database SQL credentials in `DATABASE_URL`, rather than an application login password.                                                       |
| Website still rejects the login      | Same database in Render and the setup command; exact application password chosen during setup; use the reset command if the account already existed. |
| Too many sign-in attempts            | Allow the 15-minute login-limit window to expire before trying again.                                                                                |

Administrator and staff account creation remains **administrator-only** through **User accounts**. Public users may self-register through the separate public signup flow; the administrator recovery command itself still creates or resets only the fixed administrator.

## Render Free document-storage limitation

For a free service, set `UPLOAD_DIR=uploads` and do not attach a paid disk. This directory is ephemeral: uploaded bytes can disappear after idle shutdowns, restarts or deployments while their CockroachDB metadata remains. The administrator command intentionally does not seed sample document references to files on your Mac. Persistent cloud document storage is a separate required update for a complete free-hosted upload/download workflow; it has not been implemented by this account-setup change.

## Create accounts after administrator setup

Use **Department / administrator** when signing in. Open the top-right account menu → **User accounts → Add user account**. Select **Public user · read-only** for a general visitor; choose a username and private password of 12–128 characters. The visitor signs in through **Public user** and can view safe registered-property information only. Existing owner and officer accounts use the department area and require their matching linked profiles. Visitors may alternatively select **Public user → Create account** to register a read-only account themselves. See [PUBLIC_SIGNUP.md](PUBLIC_SIGNUP.md).


## Officer links and account deletion

All new staff accounts, including bank verifiers, require an active officer profile with the matching designation and office. User accounts shows existing profile/office links and officers without accounts. Use **Link profile** to repair an active account without replacing its credentials. **Delete account** revokes access immediately; referenced audit identities remain inactive so history stays connected. See [Role access and workflows](ROLE_ACCESS.md).

## Staff profiles and office links

For a Survey officer, Valuation officer, Sub-registrar, Bank verifier or Auditor, create the officer profile inside the account form and select its office. The role supplies the designation. Alternatively link an existing historical officer with no login. The officer and account are committed together; duplicate usernames or other failures do not leave an orphan profile. [ROLE_TESTING.md](ROLE_TESTING.md) lists exact permissions and manual cases.
