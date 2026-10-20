# Roles, visibility and manual testing

The current permission matrix is documented in [ROLE_ACCESS.md](ROLE_ACCESS.md). Department access is limited to the linked officer’s office and duties; survey work is additionally limited to the assigned officer. Only administrators can view the whole registry, account administration and ER schema. Bank and audit workspaces are read-only.

## Creating a synchronized officer account

1. Administrator → username menu → **User accounts → Add user account**, or **Officers → Add officer account**.
2. Choose one of the five officer-profile roles.
3. Select **Create a new officer and account**, enter the officer's full name and select an existing office. Add optional email/phone and choose a private password.
4. The server fixes designation to the selected role and saves officer + login + office link + audit events in one serializable transaction. A failed account insert leaves no new officer row.
5. For imported/historical profiles, use **Link an existing officer**, or open that officer and choose **Create linked officer account**. Existing IDs/work references are retained. A profile already linked to a login cannot receive a second login through this flow; concurrent requests are checked too.
6. Account listings show officer and office names; administrator officer details show the linked username/status. Changing an officer's Active setting synchronizes its account and rejects existing sessions while inactive. Referenced work prevents changing the profile's designation/office and invalidating history.

Imported historical profiles retain their IDs and work references. Administrators can create or link their logins privately, and the controlled provisioning command can fill missing accounts. The existing `users.officer_id → officers.id → offices.id` relationships remain authoritative. The bank designation/profile check upgrade is described in [ROLE_ACCESS.md](ROLE_ACCESS.md).

## Suggested manual checks

| Test                      | Action                                                               | Expected                                                                                           |
| ------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Nested navigation         | Property → ownership → owner → related holding; use Back/breadcrumbs | Return to the previous detail without losing the record list; linked fields open permitted records |
| Related-entry navigation  | Property → add document/transaction/survey; Cancel or save           | Return to the property's detail; a successful child save refreshes the parent                      |
| Office context            | Office → officer → work → property                                   | Correct linked records; Back path remains available                                                |
| ER inspector              | Click Inspect attributes on any table, then a relationship and Back  | All live columns/types/PK/FK/defaults/constraints shown in a visible panel on desktop or mobile    |
| Account/profile atomicity | Create a staff login with an already used username                   | Conflict; no extra officer profile                                                                 |
| Profile identity          | Choose Survey officer and an office; create account                  | New officer has survey designation and selected office; account points to its ID                   |
| Legacy link               | Link an existing sample officer and open its old work                | Same officer ID and historical links; no duplicate profile                                         |
| Own officer               | As survey/valuation user, attempt another officer's identity         | Rejected                                                                                           |
| Own office                | As survey/valuation user, choose a parcel from another office        | Rejected or wrong-office choices filtered                                                          |
| Registrar office          | Verify/approve/issue for another office                              | Rejected                                                                                           |
| Inactive account          | Administrator sets linked officer Inactive                           | Login/session rejected; account flag follows profile                                               |
| Unavailable permissions   | Test the role scopes and permitted work in ROLE_ACCESS.md            | UI hides controls; backend rejects direct attempts                                                 |

Choose private passwords yourself when creating test accounts. The same sample PDF is deliberately reused for the thirteen uploaded training documents; document metadata and relationships are distinct, but bytes are the same. It demonstrates storage/checksum/verification and is not authentic legal evidence. Office names include Training to identify these fictional registry offices. No office names or approved document copies are changed by these UI/account fixes.
