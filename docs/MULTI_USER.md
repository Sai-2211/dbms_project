# Multiple users, live updates and ER inspection

An administrator and survey officer can sign in separately in two tabs of the same browser. Each tab has its own session selector in sessionStorage and a separate signed HttpOnly/SameSite cookie. Passwords and session tokens are never stored in browser JavaScript storage. A tab cannot fall back to another tab’s cookie, and signing out does not sign out other tabs.

Modern browsers reserve tab identity with Web Locks. Reloading retains the login, while duplicating an active tab obtains a fresh identity and requires its own sign-in. Browsers without Web Locks choose a fresh identity on page load to preserve isolation; those browsers require sign-in again after reload. Existing browser tabs must refresh and sign in once after this deployment because the former shared cookie is no longer used by the UI. Existing API consumers without the tab header retain their legacy contract.

Uploads and downloads use the selected tab’s authenticated fetch path. A plain download link cannot accidentally inherit another user’s browser-wide cookie.

## Live views

An authenticated server-sent event stream checks committed CockroachDB audit revisions every 1.5 seconds. A change normally appears after that interval plus the database/network refresh time. The event contains only an opaque revision and an empty refresh message; record data is fetched again through the normal role-scoped APIs. Private registration approvals and other officers’ survey events also invalidate the affected readable property/title views, without granting access to those workflows. Public subscribers receive invalidation only for their registered-property view. Foreign-office changes and rolled-back transactions do not advance an unrelated user’s scoped revision.

The stream rechecks account/profile activity, closes for revoked accounts, sends keepalives, and reconnects after network loss or server restarts. Reconnection and returning focus to a tab refresh its authorized views. The database audit log is shared, so separate API instances and devices observe the same committed changes. This does not depend on a process-local broadcast or browser-only messages.

Dashboards, lists, lookups, account coverage and open read-only detail views refresh automatically. Public detail views also refresh. Search filters and open drafts stay mounted. Editing an existing record includes its exact database timestamp version; if another user changed it, the server rejects the stale save with HTTP 409 and asks the user to cancel editing, reload the latest record and reapply the change. Existing serializable approval and ownership rules remain enforced.

## ER inspection

Clicking a table rectangle selects/highlights its relationships and supports dragging. It does not open an attributes panel. **Inspect attributes** is the entry point for the attributes drawer, including keyboard activation. Relationship navigation and Back remain available inside that drawer. The permanent duplicate sidebar was removed so attributes are shown only through inspection.

## Verification

The automated suite verifies shared-cookie-jar isolation, signature/slot binding, logout, downloads, live committed changes, privacy scopes, rollback, revoked sessions, stale edits and shutdown. Browser tests also exercised two actual tabs, a survey-to-admin live property update, reload persistence, independent sign-out and button-only ER inspection against a disposable registry.
