# Host LandLedger on Render

This guide deploys **one Node Web Service**: Express serves the built React frontend and the `/api` routes from the same HTTPS address. CockroachDB Cloud stores the records; a Render persistent disk stores private document files. The approved 18-table schema is unchanged.

The repository includes `render.yaml`, so Render can import the settings. **The Blueprint selects a paid 512 MB service (`0.5c-512mb`) and a 1 GB persistent disk. Review Render's displayed cost before creating the resources.** A free service does not support this persistent disk or the Shell used for initialization. No Render PostgreSQL database is needed.

## 1. Prepare CockroachDB Cloud

1. Open your existing cluster and confirm that the database **`sai_2211`** exists. Creating the cluster alone does not connect this application.
2. In **Connect**, select your SQL user, `sai_2211`, and the general connection string.
3. Replace the password placeholder privately with that SQL user's password. URL-encode special characters in the password when building a URL. A pattern is:

   ```text
   postgresql://SQL_USER:URL_ENCODED_PASSWORD@CLUSTER_HOST:26257/sai_2211?sslmode=verify-full
   ```

4. Keep `sslmode=verify-full`. The production service rejects weaker modes. Node normally trusts the public certificate authority used by CockroachDB Cloud Basic, so a CA file downloaded onto your Mac is not normally required on Render. A local certificate path on your Mac is not available on Render.
5. In the cluster's networking settings, allow the Render service's outbound IP ranges. Once the service is created, find them under **Connect → Outbound** in Render and add the listed CIDR ranges to CockroachDB's IP allowlist. An allowlist that includes only your home IP will block Render. Restrict access to the needed ranges rather than leaving an unrestricted allowlist.

Use the regenerated SQL password if you previously shared a password. Enter the complete URL only in Render's private environment settings. Do not put it in `render.yaml`, GitHub, a frontend `VITE_*` variable, or a screenshot.

## 2. Import the Blueprint

1. Sign in to [Render](https://dashboard.render.com/) and connect your GitHub account.
2. Choose **New → Blueprint** and select **`Sai-2211/dbms_project`**.
3. Select branch **`main`**. Render reads the root `render.yaml` and proposes the `landledger` Web Service and its disk.
4. Supply the two requested private values:

   | Variable              | Value to enter                                                                                                                          |
   | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
   | `DATABASE_URL`        | Your complete CockroachDB Cloud URL for `sai_2211`, with the actual SQL password and `sslmode=verify-full`.                             |
   | `DEMO_ADMIN_PASSWORD` | A new private password, 12–128 characters, for the seven fictional course-demo accounts. The published local demo password is rejected. |

5. Review the service, Singapore region, disk and recurring cost, then create the Blueprint when you are ready. Creating these resources is a step you perform in Render; repository preparation does not create or pay for them.
6. Check CockroachDB's network allowlist as described above. If the first deployment fails while networking is being configured, correct the allowlist and deploy again.

Render generates `SESSION_SECRET` automatically. The application reads Render's assigned `RENDER_EXTERNAL_URL`, so **you do not need to predict the site URL or set `APP_ORIGIN` for the default Render address**. It binds to `0.0.0.0` and uses Render's assigned `PORT`.

## 3. Let the first deployment finish

The Blueprint uses:

| Setting              | Repository value                        |
| -------------------- | --------------------------------------- |
| Runtime              | Node.js, maintained `22.x` release      |
| Build command        | `npm ci --include=dev && npm run build` |
| Start command        | `npm run start:render`                  |
| Health check         | `/api/health`                           |
| Environment          | `NODE_ENV=production`, `HOST=0.0.0.0`   |
| Document directory   | `UPLOAD_DIR=/var/data/uploads`          |
| Persistent disk      | `/var/data`, 1 GB                       |
| Automatic deployment | After GitHub checks pass                |

The build installs dependencies, checks TypeScript, and builds React. The start command applies the existing schema with `CREATE ... IF NOT EXISTS`, then starts Express. This initializes a new database and is safe to repeat for this initial schema; it does not upgrade future schema revisions automatically.

The health check queries the connected database. A healthy service therefore confirms that the API can reach CockroachDB. It does not confirm that demo accounts have been created yet. The frontend opens at the service's assigned `https://...onrender.com` URL.

## 4. Initialize the fictional demo once

After the service is healthy, open that service's **Shell** tab and run:

```sh
npm run db:bootstrap-demo
```

This explicit command checks that it is running on Render and that a private `DEMO_ADMIN_PASSWORD` was supplied. It creates the fictional records, seven role accounts and the sample PDF on the mounted disk. Only the seed subprocess uses development mode; the running web service remains in production mode with secure cookies.

The normal `npm run db:seed` remains disabled in production. The Render wrapper retains the seed's protections: an existing demo is left unchanged, and an unrelated non-empty registry is refused. It is a course-demo initializer, not a command for adding users to a live government registry. Do not initialize demo data inside a database containing real records.

Sign in using **`admin@landledger.local`** and your private `DEMO_ADMIN_PASSWORD`. The other role usernames are in the README; all seven initially use the password you supplied. After initialization, you may remove `DEMO_ADMIN_PASSWORD` from the service's environment settings. Removing or changing this setting does **not** change existing account passwords.

## 5. Verify your deployed site

1. Open the HTTPS service URL and sign in.
2. Confirm the dashboard displays the fictional records and the 12 primary record tabs load.
3. Create a fictional district, refresh the page, and confirm that the saved row remains.
4. Open the ER diagram tab. It should show **18 tables and 37 foreign-key relationships** from the connected CockroachDB catalog.
5. Upload and download a fictional PDF with an authorized account. Redeploy the service and confirm the file remains available: its metadata is in CockroachDB and its bytes are on the persistent disk.
6. Try a read-only account and verify that editing actions are unavailable and rejected by the API.

These are deployment checks for you to perform after creating the service. The repository's automated tests cover local CockroachDB/API behavior, including Render configuration and proxy behavior; they do not claim that your public service or cloud credentials were tested.

## If you already created a Web Service manually

You can configure that existing service instead of creating a duplicate Blueprint service. Select the GitHub repository and `main`, use the build/start/health settings above, and add a paid persistent disk mounted at `/var/data`. Set `NODE_VERSION=22.x`, `NODE_ENV=production`, `HOST=0.0.0.0`, `UPLOAD_DIR=/var/data/uploads`, your private `DATABASE_URL`, and your private `DEMO_ADMIN_PASSWORD`.

Also set `SESSION_SECRET` to a random value of at least 32 characters. Generate one locally with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Render supplies `PORT`, `RENDER`, and `RENDER_EXTERNAL_URL` itself. Clear an old local `APP_ORIGIN` value so the assigned HTTPS address is used. Deploy the latest commit, configure the cloud allowlist, and follow the Shell initialization above.

## Common issues

| Symptom                                                               | What to check                                                                                                                    |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Database connection timeout                                           | Cluster availability, hostname, port 26257, and CockroachDB allowlist for Render's outbound CIDRs.                               |
| SQL authentication failure                                            | SQL username/password, the `sai_2211` database, and password URL encoding.                                                       |
| Password-placeholder error                                            | Replace `<ENTER-SQL-USER-PASSWORD>` privately in Render's `DATABASE_URL`.                                                        |
| TLS configuration error                                               | Keep `sslmode=verify-full`; do not disable certificate verification.                                                             |
| No open port / health check fails                                     | Bind host `0.0.0.0`, Render-injected `PORT`, database connection, and successful migration in logs.                              |
| Login fails before initialization                                     | Run `npm run db:bootstrap-demo` in Render Shell, then use the private password supplied for that first seed.                     |
| Demo seed disabled in production                                      | Use the explicit Render bootstrap command above; keep the web service in production.                                             |
| Forbidden requests after adding a custom domain                       | Set `APP_ORIGIN` to the exact custom HTTPS origin, with no path/query, and use that address. One configured origin is supported. |
| Missing files after redeploy                                          | Confirm the paid disk is mounted at `/var/data` and `UPLOAD_DIR=/var/data/uploads`; ordinary service files are ephemeral.        |
| Blueprint edits do not prompt for a new secret on an existing service | Set the secret manually in that service's Environment page; `sync: false` prompts apply during initial Blueprint creation.       |

Express trusts one proxy hop when `RENDER=true`, preserving separate client rate limits without trusting every forwarded address. This setting assumes Render's direct ingress. Adding another CDN/proxy requires reviewing the proxy trust policy.

## Maintenance and limits

Keep CockroachDB backups and document-disk backups together. One disk-backed service instance is used; its file storage is not shared across multiple instances. Disk-backed deployments have platform downtime/scale limitations. The demo accounts, shared initial password and fictional legal documents are appropriate for a controlled course demonstration; real departmental use requires a separate operational and security review.

## Official references

- [Render Blueprint specification](https://render.com/docs/blueprint-spec)
- [Render environment variables](https://render.com/docs/environment-variables)
- [Persistent disks](https://render.com/docs/disks)
- [Free-service limitations](https://render.com/docs/free)
- [Render outbound IP addresses](https://render.com/docs/outbound-ip-addresses)
- [Node version selection](https://render.com/docs/node-version)
- [Connect to CockroachDB Cloud Basic](https://www.cockroachlabs.com/docs/cockroachcloud/connect-to-a-basic-cluster)

Configuration and official Blueprint schema checked on **10 October 2026**. Provider pricing and dashboard labels can change; review the current dashboard before creating resources.
