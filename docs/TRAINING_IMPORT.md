# Load the fictional registry dataset

Sign in as an administrator, open your username menu and select **Load training records**. Choose **Load complete training dataset** and keep the panel open until the result appears. The operation uses the database configured on that service: the Render app loads CockroachDB Cloud; localhost loads its configured local database.

The fixed dataset comes from [the manual-entry workbook](MANUAL_DATA_ENTRY.md). It contains 119 manually specified records across six parcels in Chennai and Thanjavur. Approval adds 14 ownership-history rows and five transfer-mutation rows, bringing the registry total to 138 rows when both districts are newly created, plus automatic audit events. Existing exact district/state pairs are reused, reducing newly created rows. The eight imported owners and eight officers each receive a numbered, automatically linked login. Existing accounts and passwords are preserved.

## Expected result

| Entity                   |                                          Dataset records |
| ------------------------ | -------------------------------------------------------: |
| Districts                |                                  2, reused where present |
| Offices                  |                                                        2 |
| Owners                   |                                                        8 |
| Officers                 |                                                        8 |
| Properties               |                               6: 4 Registered, 2 Pending |
| Transactions             |                    12: 9 Approved, 2 Pending, 1 Rejected |
| Transaction parties      |                                                       20 |
| Documents                |                   15: 13 Verified, 1 Pending, 1 Rejected |
| Surveys                  |                              8: 6 Completed, 2 Scheduled |
| Valuations               |                                                        6 |
| Tax payments             |                           7: 5 Paid, 1 Pending, 1 Failed |
| Encumbrances             |                                  4: 3 Active, 1 Released |
| Mutations                |                     8: 6 Approved, 1 Pending, 1 Rejected |
| Service applications     | 15: 12 Approved, 1 Submitted, 1 Under review, 1 Rejected |
| Encumbrance certificates |                                                        3 |
| Ownership history        |                                   14: 8 Current, 6 Ended |

Each registered parcel has exactly 100% current ownership. The residential parcel has Aarav 50%, Meera 25% and Kavin 25%; the commercial parcel has Priya 40% and Arjun 60%; the agricultural parcel has Rohan 60% and Ananya 40%; the industrial parcel remains Priya's 100% because its proposed sale is mortgage-blocked. P1's latest survey sets its area to 245.4000 m²; entering an older industrial survey does not replace the latest 2400.0000 m² result.

The pending registration intentionally lacks uploaded/verified evidence. The proposed industrial sale has verified evidence but an active mortgage. The import attempts both approvals, checks the expected failures and verifies that ownership remains unchanged. These unfinished cases are available for learning; they are not failed imports.

## Integrity and access

- `POST /api/training-import` requires an active administrator session, the existing request-header/origin protection, and the exact body `{ "dataset": "tn-manual-entry-v1" }`. It does not accept user-supplied SQL, arbitrary rows, role overrides, destination URLs or credentials. Other roles and anonymous visitors cannot run it.
- Inputs use the existing field validation and relationship checks. Registration and transfer approvals use `approveTransfer`, including deed verification, office jurisdiction, balanced shares and encumbrance restrictions. Completed surveys and certificate snapshots use the existing business helpers.
- All database changes run in one serializable transaction. A failure rolls back database changes and removes staged sample files. Unrelated records are not overwritten or deleted. Pre-existing conflicting training identifiers cause a conflict before any insert.
- A successful import writes an audit marker with the signed-in administrator as actor. Repeating the import returns **Already loaded** without adding duplicates or rewriting history.
- The import verifies exact ownership periods, source/end transactions, final ownership totals, transaction states, latest survey areas and certificate claim snapshots before commit.
- Public users see only the four Registered parcels and the existing limited public projection. Imported identity/contact information, precise locations, documents and claims remain restricted by the existing role rules.
- No schema changes or new tables are required. New owner/officer accounts are created atomically with their profiles.

## Sample attachment recovery on Render Free

The importer stores 13 copies of the clearly marked fictional PDF through the document metadata fields. After a restart deletes temporary files, an authorized document download may serve the versioned sample from the repository. Recovery requires an exact known training document number, sample filename, PDF media type, matching SHA-256 hash and matching byte length. The same download authorization remains in force, and the database metadata is unchanged.

This recovery works only for the known fictional sample. Other uploaded documents still need persistent storage to survive Render Free restarts. It does not substitute the sample for missing real documents.

## Verification

The integration suite uses a disposable local CockroachDB database. It tests role/CSRF/custom-payload rejection, identifier-conflict refusal without partial data/files, reuse of existing districts, preservation of existing admin passwords and unrelated properties, all imported workflow states, ownership history, document downloads, sample recovery after deleting an isolated test file, certificate snapshots, audit actor and repeated-import idempotence. See the [verification report](VERIFICATION_REPORT.md) and its current summary.

## Hosted dataset checkpoint

On 12 October 2026, this import successfully created 138 registry rows plus audit events in the hosted application. Both districts were new; existing user accounts were preserved. The interface confirmed six parcels, eight owners, two intentionally Pending transactions, the expected ownership history and an authorized sample PDF download. This is a dated checkpoint, not a promise that later user edits leave those counts unchanged.
