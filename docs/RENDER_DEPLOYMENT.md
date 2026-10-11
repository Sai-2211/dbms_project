# Host LandLedger on Render Free

LandLedger runs as **one Node Web Service**. Express serves the built React frontend and the `/api` backend from the same HTTPS address. CockroachDB Cloud stores the related records. You do not need a Render PostgreSQL database, a separate static site, or a paid service for the account and property workflows.

This guide targets your existing Free service at `https://dbms-project-dph6.onrender.com/`. The root `render.yaml` is an optional **paid** Blueprint with a persistent document disk; do not import that Blueprint for a zero-budget deployment.

## 1. Check your existing Web Service settings

Open your service in the Render dashboard. Under Settings, use:

| Setting             | Value                                                 |
| ------------------- | ----------------------------------------------------- |
| Repository / branch | `Sai-2211/dbms_project` / `main`                      |
| Runtime             | Node                                                  |
| Root directory      | Leave blank                                           |
| Build command       | `npm ci --include=dev && npm run build`               |
| Start command       | `npm run start:render`                                |
| Health check path   | `/api/health`                                         |
| Instance            | Free                                                  |
| Auto-deploy         | On Commit, if you want pushes to deploy automatically |

The build checks TypeScript and builds React. The start command creates missing approved tables, upgrades the two account role/profile constraints to support public users, then starts Express. It preserves existing records and passwords. The role migration can run repeatedly. A successful deployment does not automatically create login accounts.

## 2. Check Environment variables

| Variable         | Value                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`   | Complete private CockroachDB URL for `sai_2211`, with the actual SQL password and `sslmode=verify-full` |
| `SESSION_SECRET` | A private random string of at least 32 characters                                                       |
| `NODE_VERSION`   | `22.x`                                                                                                  |
| `NODE_ENV`       | `production`                                                                                            |
| `HOST`           | `0.0.0.0`                                                                                               |
| `UPLOAD_DIR`     | `uploads`                                                                                               |

For the URL, select the SQL user and `sai_2211` database in CockroachDB's Connect dialog. Replace the password placeholder privately; URL-encode reserved characters in that password. The pattern is:

```text
postgresql://SQL_USER:URL_ENCODED_PASSWORD@CLUSTER_HOST:26257/sai_2211?sslmode=verify-full
```

Do not put the database password in GitHub, a `VITE_*` variable, screenshots or chat. Use a regenerated SQL password if the previous password was shared. Do not disable TLS verification. Node normally trusts the public certificate authority for CockroachDB Cloud Basic; a certificate file downloaded on your Mac is not automatically available on Render.

Render supplies `PORT`, `RENDER` and `RENDER_EXTERNAL_URL`. Leave an old local `APP_ORIGIN` unset; the application uses the assigned Render HTTPS origin. For a custom domain, explicitly set its exact HTTPS origin without a path. `DEMO_ADMIN_PASSWORD` is not required for administrator initialization on Free and does not create/reset an account by itself.

If you need to generate a session secret locally:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Paste the result privately into Render. Changing it signs existing users out.

## 3. Allow Render to reach CockroachDB

This is the connection step discussed earlier. There is no special connector to install: the backend connects through `DATABASE_URL`; the network allowlist permits its traffic.

1. In Render, open **your Web Service**.
2. Click **Connect** at the top right, then choose **Outbound**.
3. Copy **every displayed CIDR range**, including the `/number` suffix. These are outbound network ranges, not your website URL or your home IP.
4. In CockroachDB Cloud, open your `moon-lemur` cluster, then **Networking → IP Allowlist**.
5. Choose **Add Network → New Network**. Give the entry a label such as `Render outbound 1`, paste one CIDR, and select **SQL client access**. Apply/save it.
6. Repeat for the other displayed Render ranges. Do not replace your Mac's entry with Render's entry: both can coexist.
7. Add **Current Network** separately so your Mac can run administrator setup against the same cloud database.
8. After the required specific entries are saved, remove an unrestricted `0.0.0.0/0` entry if one exists and no other clients need it. Allow approximately 30 seconds for changes to apply.
9. Back in Render, choose **Manual Deploy → Deploy latest commit** if automatic deployment has not already run or the previous attempt failed.

Render outbound ranges are shared with services in the region; they are a network restriction, not a replacement for database authentication and verified TLS. Recheck them if you move the service to another region.

Official instructions: [Render outbound IP addresses](https://render.com/docs/outbound-ip-addresses), [CockroachDB Basic connection and allowlist](https://www.cockroachlabs.com/docs/cockroachcloud/connect-to-a-basic-cluster).

## 4. Verify the database connection

Open:

[Your database health check](https://dbms-project-dph6.onrender.com/api/health)

The successful response is:

```json
{ "status": "connected", "database": "CockroachDB" }
```

This means the backend can reach CockroachDB. If you already get this response, the Render database connection is working; wrong website credentials are a separate account issue. It does not prove that an administrator account exists.

On a fresh database, the department dashboard and public directory can be empty. Records appear as you enter and approve them; the public portal only shows properties marked registered by the controlled registration workflow.

## 5. Create or recover the administrator from your Mac

Render Free has no Shell. Open the repository folder in VS Code and use its Terminal:

```sh
git pull origin main
npm ci
npm run db:admin
```

The command privately prompts for the exact `DATABASE_URL` from Render and a new application password of 12–128 characters. Nothing is echoed or saved as plaintext. It creates only the administrator and an audit event, not fictional parcels or uploaded files.

If the administrator already exists and you do not know its password, use:

```sh
npm run db:admin -- --reset-password
```

Sign in under **Department / administrator** using `admin@landledger.local` and the application password you entered. The SQL password belongs in the database URL; the application password belongs on the website. Updating `DEMO_ADMIN_PASSWORD` does not change an existing website password. See [ACCOUNT_SETUP.md](ACCOUNT_SETUP.md) for recovery details.

## 6. Create public user accounts

1. Sign in as administrator and open the account menu at the top right.
2. Choose **User accounts → Add user account**.
3. Enter a username and a private password of 12–128 characters.
4. Select **Public user · read-only**, then create the account. No linked owner/officer profile is needed.
5. Sign out. Select **Public user** on the login screen and sign in with that account.

Public users can search registered properties, filter districts, open safe details, paginate and export the displayed page. They cannot view owner identities, deeds, tax payments, audit logs, accounts, pending/rejected properties or the ER diagram, and cannot change records. There is no public self-registration. Staff accounts still use the department sign-in area and their existing role permissions.

## 7. Understand the Free limits

- Free services spin down after 15 minutes without inbound traffic; a later request may need roughly a minute to wake them.
- Free workspaces have a limited monthly allocation of instance hours. Check current allowances in Render rather than assuming unlimited uptime.
- Free services have no persistent disk and no Shell access.
- `UPLOAD_DIR=uploads` uses temporary storage. Uploaded document bytes can disappear on restart, idle shutdown or redeployment. Their SQL metadata and other records remain in CockroachDB.
- Persistent document uploads need a separate object-storage integration or a paid persistent disk. That integration is not part of this update. Do not assume that an uploaded deed is permanently stored on Free.

See [Render's current Free limitations](https://render.com/docs/free). CockroachDB's quota and billing are separate from Render's; monitor the cloud database plan as well.

## Troubleshooting

| Symptom                                      | Check                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------------------- |
| Database timeout                             | Cluster, hostname/port and all Render outbound CIDRs in the SQL allowlist        |
| SQL authentication failure                   | SQL user, password URL encoding, selected `sai_2211` database                    |
| Password placeholder/TLS error               | Full private URL and `sslmode=verify-full`                                       |
| No open port / health fails                  | Host `0.0.0.0`, Render-injected port, successful migration logs                  |
| Login says wrong credentials                 | Initialize/reset administrator against the exact database URL used by Render     |
| Account belongs to other sign-in area        | Use Public user for `public_viewer`; department area for staff/admin             |
| Public role rejected during account creation | Deploy latest commit with `npm run start:render`, so the role migration runs     |
| Upload path permission error                 | Use `UPLOAD_DIR=uploads` on Free; `/var/data/uploads` is for a mounted paid disk |
| Uploaded file no longer found                | Free filesystem is temporary; SQL metadata alone does not retain file bytes      |
| Slow first page / deployment health timeout  | Allow the Free service to wake and check Render deployment logs                  |
| Custom domain writes rejected                | Set `APP_ORIGIN` to that exact HTTPS origin                                      |

## Optional paid Blueprint

If you later choose paid hosting, `render.yaml` defines one paid Node service and a 1 GB disk mounted at `/var/data`; it uses `UPLOAD_DIR=/var/data/uploads`. Review the price before importing **New → Blueprint**. Its private fictional-demo initializer is `npm run db:bootstrap-demo` in the paid service's Shell, with a private `DEMO_ADMIN_PASSWORD`. This is optional course-demo seeding for an otherwise empty database, not a prerequisite for the administrator/public-user portal.
