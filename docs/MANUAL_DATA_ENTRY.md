# LandLedger manual data-entry workbook

Prepared 12 October 2026 against the current app schema and form fields. All people, addresses, offices, property records and claims below are fictional training data. Tamil Nadu district names and PIN-code formats provide plausible context; training offices are not actual government offices. Prices and taxes are illustrative, not official rates.

## Before you start

- I can insert records when you authorize it. This workbook supplies copy-and-paste values only; it does not execute database operations. Use the controlled import if you want automatic entry.
- Use your existing administrator on the app you want to populate. Localhost and Render may use different databases; enter this set in one environment at a time.
- Enter one form at a time. Copy the value after the colon into its matching field; select dropdowns by their readable names. You cannot paste a whole record block into a single field. Dates use YYYY-MM-DD; your browser may display another date format. Amounts have no commas or currency symbols; areas are square metres.
- Aliases such as P1, T1, O-A and R-CH exist only in this workbook. The app generates UUIDs; never paste these aliases into an ID field. References point to records you have already saved.
- Enter sections in order. The 12 main tabs contain the primary entities. Service applications, certificates, ownership history, audit trail and User accounts are in your username menu. Add transaction parties from the transaction details.
- Do not manually enter UUIDs, timestamps, password hashes, ownership history, audit events, approval fields, certificate issue dates or JSON snapshots. Those are created by the app.
- All dated input is in July–September 2026, before the preparation date. Reviewers' verification/approval dates and generated transfer-mutation dates are the day you actually perform those actions.
- If these TRN document, office, receipt or certificate numbers already exist, skip the corresponding completed record or use a new consistent prefix everywhere. Do not rerun the same entry set blindly. Chennai and Thanjavur may already exist: reuse their exact district/state pairs.
- Use [Fictional-Training-Upload.pdf](Fictional-Training-Upload.pdf) for the upload steps. It is an explicit training placeholder, reusable for this project demonstration, and is not a deed or identity document. Every transaction-linked document must be uploaded and verified before successful approval.
- Render Free upload files are temporary: restarts/redeployments can remove them. SQL rows remain in CockroachDB. Keep this PDF locally; avoid restarting Render during your upload/approval practice.

## Start with a small complete path

For a first pass, create section 1, P1 from section 3, its surveys/valuations, then workflow T1. Check that P1 becomes Registered and Aarav owns 100%. Continue with the rest of the workbook for the full relationship exercise. Account creation in section 2 is optional until you test roles.

## Transaction label tracking

The Related transaction dropdown shows a type and short UUID. Write the label beside the alias when you create it. Creating parties/documents directly inside a transaction is the easiest way to retain the right link.

| Workbook alias | Property | Type | Actual dropdown label (fill yourself) |
|---|---|---|---|
| T1 | P1 | registration | ____________________ |
| T2 | P2 | registration | ____________________ |
| T3 | P3 | registration | ____________________ |
| T4 | P4 | registration | ____________________ |
| T5 | P5 | registration | ____________________ |
| T6 | P6 | registration | ____________________ |
| T7 | P1 | sale | ____________________ |
| T8 | P1 | gift | ____________________ |
| T9 | P2 | sale | ____________________ |
| T10 | P3 | inheritance | ____________________ |
| T11 | P4 | gift | ____________________ |
| T12 | P4 | sale | ____________________ |

## 1. Districts, offices, owners and officers

Enter these first while signed in as an administrator. If Chennai / Tamil Nadu or Thanjavur / Tamil Nadu already exists, select that existing district instead of creating a duplicate. Create the training offices below; they are separate from the seeded Central Registry offices.

### D-CH — District

```text
District name: Chennai
State name: Tamil Nadu
```

Reuse an existing exact district/state pair if present.

### D-TH — District

```text
District name: Thanjavur
State name: Tamil Nadu
```

Reuse an existing exact district/state pair if present.

### OFF-CH — Office

```text
Office name: Adyar Property Registry - Training
Office code: TRN-TN-ADY-01
District: D-CH - Chennai
Address: 24 Registry Lane, Adyar, Chennai, Tamil Nadu 600020
Phone: (leave blank)
```

### OFF-TH — Office

```text
Office name: Papanasam Property Registry - Training
Office code: TRN-TN-PAP-01
District: D-TH - Thanjavur
Address: 8 Taluk Office Road, Papanasam, Thanjavur, Tamil Nadu 614205
Phone: (leave blank)
```

### O-A — Owner

```text
Full name: Aarav Kumar
Identification number: TRAIN-TN-ID-001
Address: 17 Lake View Street, Adyar, Chennai, Tamil Nadu 600020
Phone: (leave blank)
Email: aarav.kumar@example.test
```

### O-B — Owner

```text
Full name: Meera Raman
Identification number: TRAIN-TN-ID-002
Address: 42 Canal Road, Thiruvanmiyur, Chennai, Tamil Nadu 600041
Phone: (leave blank)
Email: meera.raman@example.test
```

### O-C — Owner

```text
Full name: Kavin Raj
Identification number: TRAIN-TN-ID-003
Address: 9 Second Cross Street, Velachery, Chennai, Tamil Nadu 600042
Phone: (leave blank)
Email: kavin.raj@example.test
```

### O-D — Owner

```text
Full name: Priya Nair
Identification number: TRAIN-TN-ID-004
Address: 31 Market Street, Adyar, Chennai, Tamil Nadu 600020
Phone: (leave blank)
Email: priya.nair@example.test
```

### O-E — Owner

```text
Full name: Arjun Das
Identification number: TRAIN-TN-ID-005
Address: 12 Mill Road, Papanasam, Thanjavur, Tamil Nadu 614205
Phone: (leave blank)
Email: arjun.das@example.test
```

### O-F — Owner

```text
Full name: Diya Menon
Identification number: TRAIN-TN-ID-006
Address: 6 South Agraharam Street, Papanasam, Thanjavur, Tamil Nadu 614205
Phone: (leave blank)
Email: diya.menon@example.test
```

### O-G — Owner

```text
Full name: Rohan Iyer
Identification number: TRAIN-TN-ID-007
Address: 18 Station Road, Kumbakonam, Thanjavur, Tamil Nadu 612001
Phone: (leave blank)
Email: rohan.iyer@example.test
```

### O-H — Owner

```text
Full name: Ananya Devi
Identification number: TRAIN-TN-ID-008
Address: 27 Temple Tank Street, Papanasam, Thanjavur, Tamil Nadu 614205
Phone: (leave blank)
Email: ananya.devi@example.test
```

### R-CH — Officer

```text
Full name: Lakshmi Srinivasan
Designation: Sub Registrar
Office: OFF-CH - Adyar Property Registry - Training
Phone: (leave blank)
Email: lakshmi.registrar@example.test
Active: Active
```

### S-CH — Officer

```text
Full name: Suresh Balan
Designation: Survey Officer
Office: OFF-CH - Adyar Property Registry - Training
Phone: (leave blank)
Email: suresh.survey@example.test
Active: Active
```

### V-CH — Officer

```text
Full name: Nandhini Ravi
Designation: Valuation Officer
Office: OFF-CH - Adyar Property Registry - Training
Phone: (leave blank)
Email: nandhini.valuation@example.test
Active: Active
```

### A-CH — Officer

```text
Full name: Ganesh Narayanan
Designation: Auditor
Office: OFF-CH - Adyar Property Registry - Training
Phone: (leave blank)
Email: ganesh.audit@example.test
Active: Active
```

### R-TH — Officer

```text
Full name: Revathi Murugan
Designation: Sub Registrar
Office: OFF-TH - Papanasam Property Registry - Training
Phone: (leave blank)
Email: revathi.registrar@example.test
Active: Active
```

### S-TH — Officer

```text
Full name: Mohan Selvam
Designation: Survey Officer
Office: OFF-TH - Papanasam Property Registry - Training
Phone: (leave blank)
Email: mohan.survey@example.test
Active: Active
```

### V-TH — Officer

```text
Full name: Deepa Krishnan
Designation: Valuation Officer
Office: OFF-TH - Papanasam Property Registry - Training
Phone: (leave blank)
Email: deepa.valuation@example.test
Active: Active
```

### A-TH — Officer

```text
Full name: Bharath Rajan
Designation: Auditor
Office: OFF-TH - Papanasam Property Registry - Training
Phone: (leave blank)
Email: bharath.audit@example.test
Active: Active
```

## 2. Optional role accounts for checking access

Use your username menu → User accounts → Add user account. Keep your existing administrator. Choose a separate private password of 12–128 characters for each account; passwords and password hashes are intentionally not supplied. These are actual accounts only after you create them. Use Department / administrator for every role except Public user.

| Username | Role | Linked owner | Linked officer |
|---|---|---|---|
| trn.admin2 (optional) | administrator | Leave blank | Leave blank |
| trn.aarav | owner | O-A - Aarav Kumar | Leave blank |
| trn.suresh | survey officer | Leave blank | S-CH - Suresh Balan |
| trn.nandhini | valuation officer | Leave blank | V-CH - Nandhini Ravi |
| trn.lakshmi | sub registrar | Leave blank | R-CH - Lakshmi Srinivasan |
| trn.bank | bank verifier | Leave blank | Leave blank |
| trn.ganesh | auditor | Leave blank | A-CH - Ganesh Narayanan |
| trn.public | public viewer | Leave blank | Leave blank |

**Next action:** The second administrator is optional. Public signup can also create trn.public if you have not already created it through the administrator. Do not do both: usernames must be unique. These names do not use the reserved @landledger.local suffix.

## 3. Six property records

Create all six in Properties. New properties start Pending; do not type a registration date or try to set Registered. Registration approval will set those protected fields.

### P1 — Property

```text
Survey number: TRN-CH-214/3A
Property type: Residential
Area (m²): 240.0000
Location: Lake View Street, Adyar, Chennai
District: D-CH - Chennai
Registration office: OFF-CH - Adyar Property Registry - Training
Boundary details: North: Lake View Street; South: parcel 214/3B; East: 3 m access lane; West: parcel 214/2.
```

### P2 — Property

```text
Survey number: TRN-CH-87/5A
Property type: Commercial
Area (m²): 180.0000
Location: Market Street, Adyar, Chennai
District: D-CH - Chennai
Registration office: OFF-CH - Adyar Property Registry - Training
Boundary details: North: market access road; South: parcel 87/6; East: parcel 87/5B; West: 4 m service lane.
```

### P3 — Property

```text
Survey number: TRN-TH-142/1A
Property type: Agricultural
Area (m²): 8100.0000
Location: Vadakku Mangudi village, Papanasam taluk, Thanjavur
District: D-TH - Thanjavur
Registration office: OFF-TH - Papanasam Property Registry - Training
Boundary details: North: irrigation channel; South: parcel 142/2; East: bund adjoining parcel 143/1; West: village cart track.
```

### P4 — Property

```text
Survey number: TRN-TH-305/17
Property type: Industrial
Area (m²): 2400.0000
Location: Plot I-17, Papanasam Industrial Layout, Thanjavur
District: D-TH - Thanjavur
Registration office: OFF-TH - Papanasam Property Registry - Training
Boundary details: North: estate service road; South: plot I-18; East: 6 m internal road; West: plot I-16.
```

### P5 — Property

```text
Survey number: TRN-CH-219/7A
Property type: Residential
Area (m²): 150.0000
Location: Third Cross Street, Thiruvanmiyur, Chennai
District: D-CH - Chennai
Registration office: OFF-CH - Adyar Property Registry - Training
Boundary details: North: 6 m residential road; South: parcel 219/8; East: parcel 219/7B; West: parcel 219/6.
```

### P6 — Property

```text
Survey number: TRN-TH-66/9A
Property type: Commercial
Area (m²): 95.0000
Location: Main Road, Pandaravadai village, Papanasam taluk
District: D-TH - Thanjavur
Registration office: OFF-TH - Papanasam Property Registry - Training
Boundary details: North: village main road; South: parcel 66/10; East: parcel 66/9B; West: 3 m service lane.
```

## 4. Surveys and valuation history

Select the training officer belonging to the property office. A Completed survey updates the property area and boundaries. A Scheduled survey does not. Valuations and completed surveys are historical records; create a new one rather than editing a finalized row.

### SUR-1 — Survey

```text
Property: P1 - TRN-CH-214/3A
Officer: S-CH - Suresh Balan
Survey number: TRN-SUR-2026-001
Survey date: 2026-08-02
Survey area (m²): 240.0000
Boundary details: North: Lake View Street; South: parcel 214/3B; East: 3 m access lane; West: parcel 214/2.
Status: Completed
```

### SUR-2 — Survey

```text
Property: P2 - TRN-CH-87/5A
Officer: S-CH - Suresh Balan
Survey number: TRN-SUR-2026-002
Survey date: 2026-08-03
Survey area (m²): 180.0000
Boundary details: North: market access road; South: parcel 87/6; East: parcel 87/5B; West: 4 m service lane.
Status: Completed
```

### SUR-3 — Survey

```text
Property: P3 - TRN-TH-142/1A
Officer: S-TH - Mohan Selvam
Survey number: TRN-SUR-2026-003
Survey date: 2026-08-04
Survey area (m²): 8100.0000
Boundary details: North: irrigation channel; South: parcel 142/2; East: bund adjoining parcel 143/1; West: village cart track.
Status: Completed
```

### SUR-4 — Survey

```text
Property: P4 - TRN-TH-305/17
Officer: S-TH - Mohan Selvam
Survey number: TRN-SUR-2026-004
Survey date: 2026-08-05
Survey area (m²): 2400.0000
Boundary details: North: estate service road; South: plot I-18; East: 6 m internal road; West: plot I-16.
Status: Completed
```

### SUR-5 — Survey

```text
Property: P5 - TRN-CH-219/7A
Officer: S-CH - Suresh Balan
Survey number: TRN-SUR-2026-005
Survey date: 2026-08-06
Survey area (m²): 150.0000
Boundary details: North: 6 m residential road; South: parcel 219/8; East: parcel 219/7B; West: parcel 219/6.
Status: Scheduled
```

### SUR-6 — Survey

```text
Property: P6 - TRN-TH-66/9A
Officer: S-TH - Mohan Selvam
Survey number: TRN-SUR-2026-006
Survey date: 2026-08-07
Survey area (m²): 95.0000
Boundary details: North: village main road; South: parcel 66/10; East: parcel 66/9B; West: 3 m service lane.
Status: Scheduled
```

### SUR-7 — Survey

```text
Property: P1 - TRN-CH-214/3A
Officer: S-CH - Suresh Balan
Survey number: TRN-SUR-2026-007
Survey date: 2026-09-10
Survey area (m²): 245.4000
Boundary details: North: Lake View Street; South: parcel 214/3B; East: surveyed 3 m access lane; West: boundary stone BS-214-02 adjoining parcel 214/2.
Status: Completed
```

Expected: P1 area becomes 245.4000 m².

### SUR-8 — Survey

```text
Property: P4 - TRN-TH-305/17
Officer: S-TH - Mohan Selvam
Survey number: TRN-SUR-2026-008
Survey date: 2026-07-28
Survey area (m²): 2395.0000
Boundary details: North: service road; South: plot I-18; East: provisional road edge; West: plot I-16.
Status: Completed
```

Enter this older survey last. Expected: P4 stays 2400.0000 m² because its 2026-08-05 completed survey is newer.

### VAL-1 — Valuation

```text
Property: P1 - TRN-CH-214/3A
Officer: V-CH - Nandhini Ravi
Valuation date: 2026-08-02
Market value (₹): 12600000.00
Purpose: Initial registration assessment
Remarks: Fictional training assessment; values are illustrative and not an official guideline rate.
```

### VAL-2 — Valuation

```text
Property: P2 - TRN-CH-87/5A
Officer: V-CH - Nandhini Ravi
Valuation date: 2026-08-03
Market value (₹): 18000000.00
Purpose: Commercial registration assessment
Remarks: Fictional training assessment; values are illustrative and not an official guideline rate.
```

### VAL-3 — Valuation

```text
Property: P3 - TRN-TH-142/1A
Officer: V-TH - Deepa Krishnan
Valuation date: 2026-08-04
Market value (₹): 4600000.00
Purpose: Agricultural registration assessment
Remarks: Fictional training assessment; values are illustrative and not an official guideline rate.
```

### VAL-4 — Valuation

```text
Property: P4 - TRN-TH-305/17
Officer: V-TH - Deepa Krishnan
Valuation date: 2026-08-05
Market value (₹): 10800000.00
Purpose: Industrial registration assessment
Remarks: Fictional training assessment; values are illustrative and not an official guideline rate.
```

### VAL-5 — Valuation

```text
Property: P1 - TRN-CH-214/3A
Officer: V-CH - Nandhini Ravi
Valuation date: 2026-09-01
Market value (₹): 13400000.00
Purpose: Market reassessment for partial sale
Remarks: Fictional training assessment; values are illustrative and not an official guideline rate.
```

### VAL-6 — Valuation

```text
Property: P2 - TRN-CH-87/5A
Officer: V-CH - Nandhini Ravi
Valuation date: 2026-09-03
Market value (₹): 19000000.00
Purpose: Market reassessment for co-owner transfer
Remarks: Fictional training assessment; values are illustrative and not an official guideline rate.
```

## 5. Initial registrations: four approved, one pending, one rejected

Each registration needs transferees totalling exactly 1. A registration has no transferor. Use the matching training sub-registrar for both document verification and transaction approval. The workflow labels below are notes for this guide, not database IDs.

**Next action:** Workflow T1: registration of P1. Follow this block completely before starting the next transaction for the same property.

### T1 — Transaction

```text
Property: P1 - TRN-CH-214/3A
Processing office: OFF-CH - Adyar Property Registry - Training
Transaction type: Registration
Transaction date: 2026-08-01
Declared consideration (₹): 12600000.00
Remarks: TRN-T1: registration training case. Fictional DBMS demonstration.
```

**Next action:** Open the T1 transaction you just saved. Add parties from its Transaction parties section so the transaction is selected automatically. The transaction dropdown otherwise uses “registration · first 8 characters of UUID”, not “T1”. Note its displayed short label in the tracking table.

### T1-A-transferee — Party

```text
Transaction: T1 - select the registration transaction created for P1; use your noted short UUID label
Owner: O-A - Aarav Kumar
Party role: Transferee
Share (1 = 100%): 1.00000000
```

### DOC-T1 — Document

```text
Document number: TRN-DEED-2026-001
Property: P1 - TRN-CH-214/3A
Related transaction: T1 - select the registration transaction created for P1; use your noted short UUID label
Document type: Registration Deed
Document date: 2026-08-01
```

### DOC-ID-1 — Document

```text
Document number: TRN-IDPROOF-2026-001
Property: P1 - TRN-CH-214/3A
Related transaction: T1 - select the registration transaction created for P1; use your noted short UUID label
Document type: Identity Proof
Document date: 2026-08-01
```

This is a second attached document. Upload and verify BOTH this record and DOC-T1 before approving T1. The training PDF is only a placeholder attachment, not identity evidence.

### APP-T1 — Application

```text
Applicant: O-A - Aarav Kumar
Property: P1 - TRN-CH-214/3A
Service type: Registration
Submitted on: 2026-08-01
Related transaction: T1 - select the registration transaction created for P1; use your noted short UUID label
Notes: TRN-APP-T1: registration request for TRN-CH-214/3A.
```

**Next action:** Open APP-T1, select R-CH and choose Mark under review. For DOC-T1 and DOC-ID-1, upload Fictional-Training-Upload.pdf, select R-CH and choose Verify document. Return to T1, select R-CH and choose Approve. The linked application becomes Approved automatically. The property becomes Registered and ownership records are created.

**Next action:** Workflow T2: registration of P2. Follow this block completely before starting the next transaction for the same property.

### T2 — Transaction

```text
Property: P2 - TRN-CH-87/5A
Processing office: OFF-CH - Adyar Property Registry - Training
Transaction type: Registration
Transaction date: 2026-08-03
Declared consideration (₹): 18000000.00
Remarks: TRN-T2: Joint ownership registration, Priya 60% and Arjun 40%. Fictional DBMS demonstration.
```

**Next action:** Open the T2 transaction you just saved. Add parties from its Transaction parties section so the transaction is selected automatically. The transaction dropdown otherwise uses “registration · first 8 characters of UUID”, not “T2”. Note its displayed short label in the tracking table.

### T2-D-transferee — Party

```text
Transaction: T2 - select the registration transaction created for P2; use your noted short UUID label
Owner: O-D - Priya Nair
Party role: Transferee
Share (1 = 100%): 0.60000000
```

### T2-E-transferee — Party

```text
Transaction: T2 - select the registration transaction created for P2; use your noted short UUID label
Owner: O-E - Arjun Das
Party role: Transferee
Share (1 = 100%): 0.40000000
```

### DOC-T2 — Document

```text
Document number: TRN-DEED-2026-002
Property: P2 - TRN-CH-87/5A
Related transaction: T2 - select the registration transaction created for P2; use your noted short UUID label
Document type: Registration Deed
Document date: 2026-08-03
```

### APP-T2 — Application

```text
Applicant: O-D - Priya Nair
Property: P2 - TRN-CH-87/5A
Service type: Registration
Submitted on: 2026-08-03
Related transaction: T2 - select the registration transaction created for P2; use your noted short UUID label
Notes: TRN-APP-T2: registration request for TRN-CH-87/5A.
```

**Next action:** Open APP-T2, select R-CH and choose Mark under review. For DOC-T2, upload Fictional-Training-Upload.pdf, select R-CH and choose Verify document. Return to T2, select R-CH and choose Approve. The linked application becomes Approved automatically. The property becomes Registered and ownership records are created.

**Next action:** Workflow T3: registration of P3. Follow this block completely before starting the next transaction for the same property.

### T3 — Transaction

```text
Property: P3 - TRN-TH-142/1A
Processing office: OFF-TH - Papanasam Property Registry - Training
Transaction type: Registration
Transaction date: 2026-08-04
Declared consideration (₹): 4600000.00
Remarks: TRN-T3: registration training case. Fictional DBMS demonstration.
```

**Next action:** Open the T3 transaction you just saved. Add parties from its Transaction parties section so the transaction is selected automatically. The transaction dropdown otherwise uses “registration · first 8 characters of UUID”, not “T3”. Note its displayed short label in the tracking table.

### T3-F-transferee — Party

```text
Transaction: T3 - select the registration transaction created for P3; use your noted short UUID label
Owner: O-F - Diya Menon
Party role: Transferee
Share (1 = 100%): 1.00000000
```

### DOC-T3 — Document

```text
Document number: TRN-DEED-2026-003
Property: P3 - TRN-TH-142/1A
Related transaction: T3 - select the registration transaction created for P3; use your noted short UUID label
Document type: Registration Deed
Document date: 2026-08-04
```

### APP-T3 — Application

```text
Applicant: O-F - Diya Menon
Property: P3 - TRN-TH-142/1A
Service type: Registration
Submitted on: 2026-08-04
Related transaction: T3 - select the registration transaction created for P3; use your noted short UUID label
Notes: TRN-APP-T3: registration request for TRN-TH-142/1A.
```

**Next action:** Open APP-T3, select R-TH and choose Mark under review. For DOC-T3, upload Fictional-Training-Upload.pdf, select R-TH and choose Verify document. Return to T3, select R-TH and choose Approve. The linked application becomes Approved automatically. The property becomes Registered and ownership records are created.

**Next action:** Workflow T4: registration of P4. Follow this block completely before starting the next transaction for the same property.

### T4 — Transaction

```text
Property: P4 - TRN-TH-305/17
Processing office: OFF-TH - Papanasam Property Registry - Training
Transaction type: Registration
Transaction date: 2026-08-05
Declared consideration (₹): 10800000.00
Remarks: TRN-T4: registration training case. Fictional DBMS demonstration.
```

**Next action:** Open the T4 transaction you just saved. Add parties from its Transaction parties section so the transaction is selected automatically. The transaction dropdown otherwise uses “registration · first 8 characters of UUID”, not “T4”. Note its displayed short label in the tracking table.

### T4-E-transferee — Party

```text
Transaction: T4 - select the registration transaction created for P4; use your noted short UUID label
Owner: O-E - Arjun Das
Party role: Transferee
Share (1 = 100%): 1.00000000
```

### DOC-T4 — Document

```text
Document number: TRN-DEED-2026-004
Property: P4 - TRN-TH-305/17
Related transaction: T4 - select the registration transaction created for P4; use your noted short UUID label
Document type: Registration Deed
Document date: 2026-08-05
```

### APP-T4 — Application

```text
Applicant: O-E - Arjun Das
Property: P4 - TRN-TH-305/17
Service type: Registration
Submitted on: 2026-08-05
Related transaction: T4 - select the registration transaction created for P4; use your noted short UUID label
Notes: TRN-APP-T4: registration request for TRN-TH-305/17.
```

**Next action:** Open APP-T4, select R-TH and choose Mark under review. For DOC-T4, upload Fictional-Training-Upload.pdf, select R-TH and choose Verify document. Return to T4, select R-TH and choose Approve. The linked application becomes Approved automatically. The property becomes Registered and ownership records are created.

**Next action:** Workflow T5: registration of P5. Follow this block completely before starting the next transaction for the same property.

### T5 — Transaction

```text
Property: P5 - TRN-CH-219/7A
Processing office: OFF-CH - Adyar Property Registry - Training
Transaction type: Registration
Transaction date: 2026-08-06
Declared consideration (₹): 7200000.00
Remarks: TRN-T5: Waiting for uploaded and verified registration deed. Fictional DBMS demonstration.
```

**Next action:** Open the T5 transaction you just saved. Add parties from its Transaction parties section so the transaction is selected automatically. The transaction dropdown otherwise uses “registration · first 8 characters of UUID”, not “T5”. Note its displayed short label in the tracking table.

### T5-B-transferee — Party

```text
Transaction: T5 - select the registration transaction created for P5; use your noted short UUID label
Owner: O-B - Meera Raman
Party role: Transferee
Share (1 = 100%): 1.00000000
```

### DOC-T5 — Document

```text
Document number: TRN-DEED-2026-005
Property: P5 - TRN-CH-219/7A
Related transaction: T5 - select the registration transaction created for P5; use your noted short UUID label
Document type: Registration Deed
Document date: 2026-08-06
```

### APP-T5 — Application

```text
Applicant: O-B - Meera Raman
Property: P5 - TRN-CH-219/7A
Service type: Registration
Submitted on: 2026-08-06
Related transaction: T5 - select the registration transaction created for P5; use your noted short UUID label
Notes: TRN-APP-T5: registration request for TRN-CH-219/7A.
```

**Next action:** Leave DOC-T5 Pending with no uploaded file; leave T5 Pending and APP-T5 Submitted. Try Verify document before upload: it should fail. Try Approve on T5: it should fail because the matching deed is not uploaded and verified. No ownership is created. This is an intentional unfinished case, not a missing required reference.

**Next action:** Workflow T6: registration of P6. Follow this block completely before starting the next transaction for the same property.

### T6 — Transaction

```text
Property: P6 - TRN-TH-66/9A
Processing office: OFF-TH - Papanasam Property Registry - Training
Transaction type: Registration
Transaction date: 2026-08-07
Declared consideration (₹): 3800000.00
Remarks: TRN-T6: Rejected training application with inconsistent supporting evidence. Fictional DBMS demonstration.
```

**Next action:** Open the T6 transaction you just saved. Add parties from its Transaction parties section so the transaction is selected automatically. The transaction dropdown otherwise uses “registration · first 8 characters of UUID”, not “T6”. Note its displayed short label in the tracking table.

### T6-H-transferee — Party

```text
Transaction: T6 - select the registration transaction created for P6; use your noted short UUID label
Owner: O-H - Ananya Devi
Party role: Transferee
Share (1 = 100%): 1.00000000
```

### DOC-T6 — Document

```text
Document number: TRN-DEED-2026-006
Property: P6 - TRN-TH-66/9A
Related transaction: T6 - select the registration transaction created for P6; use your noted short UUID label
Document type: Registration Deed
Document date: 2026-08-07
```

### APP-T6 — Application

```text
Applicant: O-H - Ananya Devi
Property: P6 - TRN-TH-66/9A
Service type: Registration
Submitted on: 2026-08-07
Related transaction: T6 - select the registration transaction created for P6; use your noted short UUID label
Notes: TRN-APP-T6: registration request for TRN-TH-66/9A.
```

**Next action:** Open DOC-T6, select R-TH and Reject the document. Then open T6, select R-TH and Reject the transaction. The linked application becomes Rejected automatically. P6 remains Pending: rejecting a transaction does not set the property itself to Rejected. No ownership record is created.

## 6. Ownership transfers and history

Do this only after T1–T4 are approved. Transfer shares are fractions of the whole property, not fractions of the seller’s share: 0.25 means 25% of the entire parcel. Transferor total must equal transferee total. Dates increase within each property’s history.

**Next action:** Workflow T7: sale of P1. Follow this block completely before starting the next transaction for the same property.

### T7 — Transaction

```text
Property: P1 - TRN-CH-214/3A
Processing office: OFF-CH - Adyar Property Registry - Training
Transaction type: Sale
Transaction date: 2026-09-01
Declared consideration (₹): 3350000.00
Remarks: TRN-T7: Aarav sells a 25% undivided share to Meera. Fictional DBMS demonstration.
```

**Next action:** Open the T7 transaction you just saved. Add parties from its Transaction parties section so the transaction is selected automatically. The transaction dropdown otherwise uses “sale · first 8 characters of UUID”, not “T7”. Note its displayed short label in the tracking table.

### T7-A-transferor — Party

```text
Transaction: T7 - select the sale transaction created for P1; use your noted short UUID label
Owner: O-A - Aarav Kumar
Party role: Transferor
Share (1 = 100%): 0.25000000
```

### T7-B-transferee — Party

```text
Transaction: T7 - select the sale transaction created for P1; use your noted short UUID label
Owner: O-B - Meera Raman
Party role: Transferee
Share (1 = 100%): 0.25000000
```

### DOC-T7 — Document

```text
Document number: TRN-DEED-2026-007
Property: P1 - TRN-CH-214/3A
Related transaction: T7 - select the sale transaction created for P1; use your noted short UUID label
Document type: Sale Deed
Document date: 2026-09-01
```

### APP-T7 — Application

```text
Applicant: O-A - Aarav Kumar
Property: P1 - TRN-CH-214/3A
Service type: Transfer
Submitted on: 2026-09-01
Related transaction: T7 - select the sale transaction created for P1; use your noted short UUID label
Notes: TRN-APP-T7: sale request for TRN-CH-214/3A.
```

**Next action:** Open APP-T7, select R-CH and choose Mark under review. For DOC-T7, upload Fictional-Training-Upload.pdf, select R-CH and choose Verify document. Return to T7, select R-CH and choose Approve. The linked application becomes Approved automatically. Previous affected holdings close, replacement holdings open, and a Pending ownership-change mutation is created. Open that generated mutation in Mutations, select R-CH and Approve it; do not add a duplicate mutation.

**Next action:** Workflow T8: gift of P1. Follow this block completely before starting the next transaction for the same property.

### T8 — Transaction

```text
Property: P1 - TRN-CH-214/3A
Processing office: OFF-CH - Adyar Property Registry - Training
Transaction type: Gift
Transaction date: 2026-09-08
Declared consideration (₹): 0.00
Remarks: TRN-T8: Aarav gifts a further 25% undivided share to Kavin. Fictional DBMS demonstration.
```

**Next action:** Open the T8 transaction you just saved. Add parties from its Transaction parties section so the transaction is selected automatically. The transaction dropdown otherwise uses “gift · first 8 characters of UUID”, not “T8”. Note its displayed short label in the tracking table.

### T8-A-transferor — Party

```text
Transaction: T8 - select the gift transaction created for P1; use your noted short UUID label
Owner: O-A - Aarav Kumar
Party role: Transferor
Share (1 = 100%): 0.25000000
```

### T8-C-transferee — Party

```text
Transaction: T8 - select the gift transaction created for P1; use your noted short UUID label
Owner: O-C - Kavin Raj
Party role: Transferee
Share (1 = 100%): 0.25000000
```

### DOC-T8 — Document

```text
Document number: TRN-DEED-2026-008
Property: P1 - TRN-CH-214/3A
Related transaction: T8 - select the gift transaction created for P1; use your noted short UUID label
Document type: Gift Deed
Document date: 2026-09-08
```

### APP-T8 — Application

```text
Applicant: O-A - Aarav Kumar
Property: P1 - TRN-CH-214/3A
Service type: Transfer
Submitted on: 2026-09-08
Related transaction: T8 - select the gift transaction created for P1; use your noted short UUID label
Notes: TRN-APP-T8: gift request for TRN-CH-214/3A.
```

**Next action:** Open APP-T8, select R-CH and choose Mark under review. For DOC-T8, upload Fictional-Training-Upload.pdf, select R-CH and choose Verify document. Return to T8, select R-CH and choose Approve. The linked application becomes Approved automatically. Previous affected holdings close, replacement holdings open, and a Pending ownership-change mutation is created. Open that generated mutation in Mutations, select R-CH and Approve it; do not add a duplicate mutation.

**Next action:** Workflow T9: sale of P2. Follow this block completely before starting the next transaction for the same property.

### T9 — Transaction

```text
Property: P2 - TRN-CH-87/5A
Processing office: OFF-CH - Adyar Property Registry - Training
Transaction type: Sale
Transaction date: 2026-09-03
Declared consideration (₹): 3800000.00
Remarks: TRN-T9: Priya sells 20% of the whole parcel to existing co-owner Arjun. Fictional DBMS demonstration.
```

**Next action:** Open the T9 transaction you just saved. Add parties from its Transaction parties section so the transaction is selected automatically. The transaction dropdown otherwise uses “sale · first 8 characters of UUID”, not “T9”. Note its displayed short label in the tracking table.

### T9-D-transferor — Party

```text
Transaction: T9 - select the sale transaction created for P2; use your noted short UUID label
Owner: O-D - Priya Nair
Party role: Transferor
Share (1 = 100%): 0.20000000
```

### T9-E-transferee — Party

```text
Transaction: T9 - select the sale transaction created for P2; use your noted short UUID label
Owner: O-E - Arjun Das
Party role: Transferee
Share (1 = 100%): 0.20000000
```

### DOC-T9 — Document

```text
Document number: TRN-DEED-2026-009
Property: P2 - TRN-CH-87/5A
Related transaction: T9 - select the sale transaction created for P2; use your noted short UUID label
Document type: Sale Deed
Document date: 2026-09-03
```

### APP-T9 — Application

```text
Applicant: O-D - Priya Nair
Property: P2 - TRN-CH-87/5A
Service type: Transfer
Submitted on: 2026-09-03
Related transaction: T9 - select the sale transaction created for P2; use your noted short UUID label
Notes: TRN-APP-T9: sale request for TRN-CH-87/5A.
```

**Next action:** Open APP-T9, select R-CH and choose Mark under review. For DOC-T9, upload Fictional-Training-Upload.pdf, select R-CH and choose Verify document. Return to T9, select R-CH and choose Approve. The linked application becomes Approved automatically. Previous affected holdings close, replacement holdings open, and a Pending ownership-change mutation is created. Open that generated mutation in Mutations, select R-CH and Approve it; do not add a duplicate mutation.

**Next action:** Workflow T10: inheritance of P3. Follow this block completely before starting the next transaction for the same property.

### T10 — Transaction

```text
Property: P3 - TRN-TH-142/1A
Processing office: OFF-TH - Papanasam Property Registry - Training
Transaction type: Inheritance
Transaction date: 2026-09-04
Declared consideration (₹): 0.00
Remarks: TRN-T10: Estate of Diya passes to two heirs, Rohan 60% and Ananya 40%. Fictional DBMS demonstration.
```

**Next action:** Open the T10 transaction you just saved. Add parties from its Transaction parties section so the transaction is selected automatically. The transaction dropdown otherwise uses “inheritance · first 8 characters of UUID”, not “T10”. Note its displayed short label in the tracking table.

### T10-F-transferor — Party

```text
Transaction: T10 - select the inheritance transaction created for P3; use your noted short UUID label
Owner: O-F - Diya Menon
Party role: Transferor
Share (1 = 100%): 1.00000000
```

### T10-G-transferee — Party

```text
Transaction: T10 - select the inheritance transaction created for P3; use your noted short UUID label
Owner: O-G - Rohan Iyer
Party role: Transferee
Share (1 = 100%): 0.60000000
```

### T10-H-transferee — Party

```text
Transaction: T10 - select the inheritance transaction created for P3; use your noted short UUID label
Owner: O-H - Ananya Devi
Party role: Transferee
Share (1 = 100%): 0.40000000
```

### DOC-T10 — Document

```text
Document number: TRN-DEED-2026-010
Property: P3 - TRN-TH-142/1A
Related transaction: T10 - select the inheritance transaction created for P3; use your noted short UUID label
Document type: Inheritance Deed
Document date: 2026-09-04
```

### APP-T10 — Application

```text
Applicant: O-G - Rohan Iyer
Property: P3 - TRN-TH-142/1A
Service type: Transfer
Submitted on: 2026-09-04
Related transaction: T10 - select the inheritance transaction created for P3; use your noted short UUID label
Notes: TRN-APP-T10: inheritance request for TRN-TH-142/1A.
```

**Next action:** Open APP-T10, select R-TH and choose Mark under review. For DOC-T10, upload Fictional-Training-Upload.pdf, select R-TH and choose Verify document. Return to T10, select R-TH and choose Approve. The linked application becomes Approved automatically. Previous affected holdings close, replacement holdings open, and a Pending ownership-change mutation is created. Open that generated mutation in Mutations, select R-TH and Approve it; do not add a duplicate mutation.

**Next action:** Workflow T11: gift of P4. Follow this block completely before starting the next transaction for the same property.

### T11 — Transaction

```text
Property: P4 - TRN-TH-305/17
Processing office: OFF-TH - Papanasam Property Registry - Training
Transaction type: Gift
Transaction date: 2026-09-05
Declared consideration (₹): 0.00
Remarks: TRN-T11: Arjun gifts the complete industrial property to Priya. Fictional DBMS demonstration.
```

**Next action:** Open the T11 transaction you just saved. Add parties from its Transaction parties section so the transaction is selected automatically. The transaction dropdown otherwise uses “gift · first 8 characters of UUID”, not “T11”. Note its displayed short label in the tracking table.

### T11-E-transferor — Party

```text
Transaction: T11 - select the gift transaction created for P4; use your noted short UUID label
Owner: O-E - Arjun Das
Party role: Transferor
Share (1 = 100%): 1.00000000
```

### T11-D-transferee — Party

```text
Transaction: T11 - select the gift transaction created for P4; use your noted short UUID label
Owner: O-D - Priya Nair
Party role: Transferee
Share (1 = 100%): 1.00000000
```

### DOC-T11 — Document

```text
Document number: TRN-DEED-2026-011
Property: P4 - TRN-TH-305/17
Related transaction: T11 - select the gift transaction created for P4; use your noted short UUID label
Document type: Gift Deed
Document date: 2026-09-05
```

### APP-T11 — Application

```text
Applicant: O-E - Arjun Das
Property: P4 - TRN-TH-305/17
Service type: Transfer
Submitted on: 2026-09-05
Related transaction: T11 - select the gift transaction created for P4; use your noted short UUID label
Notes: TRN-APP-T11: gift request for TRN-TH-305/17.
```

**Next action:** Open APP-T11, select R-TH and choose Mark under review. For DOC-T11, upload Fictional-Training-Upload.pdf, select R-TH and choose Verify document. Return to T11, select R-TH and choose Approve. The linked application becomes Approved automatically. Previous affected holdings close, replacement holdings open, and a Pending ownership-change mutation is created. Open that generated mutation in Mutations, select R-TH and Approve it; do not add a duplicate mutation.

## 7. Supporting documents, claims and a blocked sale

Create these claims only after section 6. An active mortgage, lien or dispute blocks approval. A released claim remains in history. The Other category does not itself block approval in the current implementation.

### DOC-SUR-1 — Document

```text
Document number: TRN-SURVEYREPORT-2026-001
Property: P1 - TRN-CH-214/3A
Related transaction: (leave blank)
Document type: Survey Report
Document date: 2026-09-10
```

Upload the sample PDF and Verify document using R-CH. Leave Related transaction blank.

### DOC-CLAIM-4 — Document

```text
Document number: TRN-MORTGAGE-2026-001
Property: P4 - TRN-TH-305/17
Related transaction: (leave blank)
Document type: Other
Document date: 2026-09-10
```

Upload the sample PDF and Verify document using R-TH. Leave Related transaction blank. This is supporting metadata for a fictional mortgage agreement.

### ENC-1 — Encumbrance

```text
Property: P4 - TRN-TH-305/17
Supporting document: DOC-CLAIM-4 - TRN-MORTGAGE-2026-001
Claim type: Mortgage
Claimant: Kaveri Cooperative Bank - Training
Start date: 2026-09-10
End date: (leave blank)
Status: Active
Details: Fictional secured business loan of INR 2500000 against the industrial parcel; release evidence is outstanding.
```

### ENC-2 — Encumbrance

```text
Property: P2 - TRN-CH-87/5A
Supporting document: DOC-T2 - TRN-DEED-2026-002
Claim type: Lien
Claimant: Chennai Municipal Revenue Office - Training
Start date: 2026-07-15
End date: 2026-08-20
Status: Released
Details: Fictional historical municipal arrears lien of INR 18000, discharged on 20 August 2026.
```

### ENC-3 — Encumbrance

```text
Property: P3 - TRN-TH-142/1A
Supporting document: (leave blank)
Claim type: Dispute
Claimant: Selvam Perumal - Training Claimant
Start date: 2026-09-18
End date: (leave blank)
Status: Active
Details: Fictional neighbour disputes the western cart-track boundary. Survey reconciliation and a supporting digital document are pending.
```

### ENC-4 — Encumbrance

```text
Property: P1 - TRN-CH-214/3A
Supporting document: DOC-SUR-1 - TRN-SURVEYREPORT-2026-001
Claim type: Other
Claimant: Local Access Association - Training
Start date: 2026-09-10
End date: (leave blank)
Status: Active
Details: Fictional recorded pedestrian access easement along the eastern 3 m lane; included in certificate snapshots.
```

**Next action:** Workflow T12: sale of P4. Follow this block completely before starting the next transaction for the same property. The property must retain Priya’s 100% holding because ENC-1 is active.

### T12 — Transaction

```text
Property: P4 - TRN-TH-305/17
Processing office: OFF-TH - Papanasam Property Registry - Training
Transaction type: Sale
Transaction date: 2026-09-22
Declared consideration (₹): 2850000.00
Remarks: TRN-T12: Proposed 25% sale blocked by outstanding mortgage. Fictional DBMS demonstration.
```

**Next action:** Open the T12 transaction you just saved. Add parties from its Transaction parties section so the transaction is selected automatically. The transaction dropdown otherwise uses “sale · first 8 characters of UUID”, not “T12”. Note its displayed short label in the tracking table.

### T12-D-transferor — Party

```text
Transaction: T12 - select the sale transaction created for P4; use your noted short UUID label
Owner: O-D - Priya Nair
Party role: Transferor
Share (1 = 100%): 0.25000000
```

### T12-B-transferee — Party

```text
Transaction: T12 - select the sale transaction created for P4; use your noted short UUID label
Owner: O-B - Meera Raman
Party role: Transferee
Share (1 = 100%): 0.25000000
```

### DOC-T12 — Document

```text
Document number: TRN-DEED-2026-012
Property: P4 - TRN-TH-305/17
Related transaction: T12 - select the sale transaction created for P4; use your noted short UUID label
Document type: Sale Deed
Document date: 2026-09-22
```

### APP-T12 — Application

```text
Applicant: O-D - Priya Nair
Property: P4 - TRN-TH-305/17
Service type: Transfer
Submitted on: 2026-09-22
Related transaction: T12 - select the sale transaction created for P4; use your noted short UUID label
Notes: TRN-APP-T12: sale request for TRN-TH-305/17.
```

**Next action:** Upload Fictional-Training-Upload.pdf to DOC-T12 and verify it using R-TH. Mark APP-T12 Under review using R-TH. Try approving T12 using R-TH. Expected: active-mortgage conflict; transaction stays Pending, application stays Under review, and ownership does not change. Keep this claim and transaction pending for the test; releasing the claim and approving would change the baseline counts below.

## 8. Tax payments and additional mutations

Create tax payments for the listed current owners. Paid rows are finalized; Pending and Failed rows remain editable. Receipt numbers below are unique training identifiers. For mutations, set status through the review buttons rather than entering approval fields.

### TAX-1 — Tax payment

```text
Property: P1 - TRN-CH-214/3A
Payer: O-A - Aarav Kumar
Tax year: 2026
Payment date: 2026-09-15
Amount (₹): 6800.50
Payment status: Paid
Receipt number: TRN-REC-001
Payment reference: TRN-PAY-2026-001
```

### TAX-2 — Tax payment

```text
Property: P1 - TRN-CH-214/3A
Payer: O-B - Meera Raman
Tax year: 2026
Payment date: 2026-09-16
Amount (₹): 1200.00
Payment status: Pending
Receipt number: TRN-REC-002
Payment reference: (leave blank)
```

### TAX-3 — Tax payment

```text
Property: P2 - TRN-CH-87/5A
Payer: O-D - Priya Nair
Tax year: 2026
Payment date: 2026-09-15
Amount (₹): 32000.00
Payment status: Paid
Receipt number: TRN-REC-003
Payment reference: TRN-PAY-2026-003
```

### TAX-4 — Tax payment

```text
Property: P3 - TRN-TH-142/1A
Payer: O-G - Rohan Iyer
Tax year: 2026
Payment date: 2026-09-15
Amount (₹): 2100.00
Payment status: Paid
Receipt number: TRN-REC-004
Payment reference: TRN-PAY-2026-004
```

### TAX-5 — Tax payment

```text
Property: P3 - TRN-TH-142/1A
Payer: O-H - Ananya Devi
Tax year: 2026
Payment date: 2026-09-16
Amount (₹): 1400.00
Payment status: Failed
Receipt number: TRN-REC-005
Payment reference: TRN-FAIL-2026-005
```

### TAX-6 — Tax payment

```text
Property: P4 - TRN-TH-305/17
Payer: O-D - Priya Nair
Tax year: 2026
Payment date: 2026-09-15
Amount (₹): 48000.00
Payment status: Paid
Receipt number: TRN-REC-006
Payment reference: TRN-PAY-2026-006
```

### TAX-7 — Tax payment

```text
Property: P1 - TRN-CH-214/3A
Payer: O-A - Aarav Kumar
Tax year: 2025
Payment date: 2026-08-05
Amount (₹): 6200.00
Payment status: Paid
Receipt number: TRN-REC-007
Payment reference: TRN-PAY-ARREARS-007
```

### MUT-B1 — Mutation

```text
Property: P1 - TRN-CH-214/3A
Related transaction: (leave blank)
Mutation date: 2026-09-11
Mutation type: Boundary Update
Description: Record reconciliation after TRN-SUR-2026-007; measured area 245.4000 square metres and western boundary stone BS-214-02.
```

Save Pending, then select R-CH and Approve. This row records the review; the completed survey already changed the property area.

### MUT-C2 — Mutation

```text
Property: P2 - TRN-CH-87/5A
Related transaction: (leave blank)
Mutation date: 2026-09-12
Mutation type: Correction
Description: Review requested to reconcile the spelling of the service-lane description against the recorded survey report.
```

Leave Pending. A correction mutation does not itself edit the property record in the current implementation.

### MUT-C3 — Mutation

```text
Property: P3 - TRN-TH-142/1A
Related transaction: (leave blank)
Mutation date: 2026-09-12
Mutation type: Correction
Description: Requested correction lacks matching supporting survey evidence; retained as a rejected training case.
```

Select R-TH and Reject.

### APP-MUT-1 — Application

```text
Applicant: O-A - Aarav Kumar
Property: P1 - TRN-CH-214/3A
Service type: Mutation
Submitted on: 2026-09-11
Related transaction: (leave blank)
Notes: Reconcile parcel record with completed survey TRN-SUR-2026-007 and approved boundary-update mutation MUT-B1.
```

Mark under review using R-CH, then Approve after MUT-B1 has been approved. Leave Related transaction blank.

## 9. Encumbrance certificate applications and snapshots

Create the application before its certificate. Administrators must select an Issuing sub-registrar from the property office. Issue date, issuing officer and JSON claims snapshot are generated by the server. A certificate can include active or released claims and does not release them.

### APP-EC-1 — Application

```text
Applicant: O-A - Aarav Kumar
Property: P1 - TRN-CH-214/3A
Service type: Encumbrance Certificate
Submitted on: 2026-09-09
Related transaction: (leave blank)
Notes: Request a certificate covering the residential parcel through 9 September 2026.
```

Select R-CH and Mark under review; leave it unapproved until the certificate is issued.

### EC-1 — Certificate

```text
Certificate number: TRN-EC-2026-001
Property: P1 - TRN-CH-214/3A
Period from: 2026-01-01
Period to: 2026-09-09
Related application: APP-EC-1 - select the encumbrance certificate application for P1
```

Issuing sub-registrar: R-CH. Expected snapshot: zero claims, because ENC-4 starts on 10 September. APP-EC-1 becomes Approved automatically.

### APP-EC-4 — Application

```text
Applicant: O-D - Priya Nair
Property: P4 - TRN-TH-305/17
Service type: Encumbrance Certificate
Submitted on: 2026-09-30
Related transaction: (leave blank)
Notes: Request recorded mortgage information for the industrial parcel through September 2026.
```

Select R-TH and Mark under review.

### EC-4 — Certificate

```text
Certificate number: TRN-EC-2026-002
Property: P4 - TRN-TH-305/17
Period from: 2026-01-01
Period to: 2026-09-30
Related application: APP-EC-4 - select the encumbrance certificate application for P4
```

Issuing sub-registrar: R-TH. Expected snapshot: one Active mortgage, ENC-1. APP-EC-4 becomes Approved automatically; the mortgage and T12 remain unresolved.

### EC-2 — Certificate

```text
Certificate number: TRN-EC-2026-003
Property: P2 - TRN-CH-87/5A
Period from: 2026-01-01
Period to: 2026-09-30
Related application: (leave blank)
```

Issuing sub-registrar: R-CH. Leave Related application blank to exercise the optional relation. Expected snapshot: one Released lien, ENC-2, because its July–August period overlaps this certificate period.

## 10. Expected results after completing the full baseline

Counts below apply to this workbook only; your database can also contain existing records. Reusing two districts does not add two new district rows. Optional extra experiments in section 12 change these counts.

| Table / module | Workbook rows / result |
|---|---|
| Properties | 6 manually entered |
| Owners | 8 manually entered |
| Districts | 2 manually entered |
| Offices | 2 manually entered |
| Officers | 8 manually entered |
| Transactions | 12 manually entered |
| Documents | 15 manually entered |
| Surveys | 8 manually entered |
| Valuations | 6 manually entered |
| Tax payments | 7 manually entered |
| Encumbrances | 4 manually entered |
| Mutations | 3 manually entered |
| Transaction parties | 20 manually entered |
| Service applications | 15 manually entered |
| Encumbrance certificates | 3 manually entered |
| Mutations, additional generated rows | 5 automatically created by approved transfers; approve all five |
| Ownership history | 14 generated rows: 8 current and 6 ended |
| User accounts | Your existing admin plus up to 8 optional test accounts |
| Audit trail | Automatically generated for successful creates, uploads and reviews; exact total depends on actions performed |

- Properties: P1–P4 Registered; P5–P6 Pending. Only four workbook properties appear in the public directory.
- Transactions: 9 Approved, 2 Pending (T5 and T12), 1 Rejected (T6).
- Documents: 13 Verified, 1 Pending (DOC-T5), 1 Rejected (DOC-T6).
- Mutations: 8 total, with 6 Approved, 1 Pending (MUT-C2), 1 Rejected (MUT-C3). Five are generated ownership-change mutations.
- Applications: 15 total, with 12 Approved, 1 Submitted (APP-T5), 1 Under review (APP-T12), 1 Rejected (APP-T6).
- Taxes: 5 Paid, 1 Pending, 1 Failed. Surveys: 6 Completed, 2 Scheduled. Valuations: 6.
- Encumbrances: 3 Active, 1 Released. Certificates: 3, with claim counts 0, 1 and 1 for EC-1, EC-4 and EC-2 respectively.
- P1 area: 245.4000 m² after latest survey. P4 area: 2400.0000 m² despite entering the older survey last.

### Current owners — each registered property must total exactly 1

| Property | Current ownership | Total |
|---|---|---|
| P1 — TRN-CH-214/3A | Aarav Kumar 50%; Meera Raman 25%; Kavin Raj 25% | 100% |
| P2 — TRN-CH-87/5A | Priya Nair 40%; Arjun Das 60% | 100% |
| P3 — TRN-TH-142/1A | Rohan Iyer 60%; Ananya Devi 40% | 100% |
| P4 — TRN-TH-305/17 | Priya Nair 100% | 100% |

### Expected ownership history, created automatically

| Property | Owner | Share | Valid from | Valid to | Source transaction | End transaction |
|---|---|---|---|---|---|---|
| P1 | Aarav Kumar | 1.00000000 | 2026-08-01 | 2026-09-01 | T1 | T7 |
| P2 | Priya Nair | 0.60000000 | 2026-08-03 | 2026-09-03 | T2 | T9 |
| P2 | Arjun Das | 0.40000000 | 2026-08-03 | 2026-09-03 | T2 | T9 |
| P3 | Diya Menon | 1.00000000 | 2026-08-04 | 2026-09-04 | T3 | T10 |
| P4 | Arjun Das | 1.00000000 | 2026-08-05 | 2026-09-05 | T4 | T11 |
| P1 | Aarav Kumar | 0.75000000 | 2026-09-01 | 2026-09-08 | T7 | T8 |
| P1 | Meera Raman | 0.25000000 | 2026-09-01 | Current | T7 | Blank |
| P1 | Aarav Kumar | 0.50000000 | 2026-09-08 | Current | T8 | Blank |
| P1 | Kavin Raj | 0.25000000 | 2026-09-08 | Current | T8 | Blank |
| P2 | Priya Nair | 0.40000000 | 2026-09-03 | Current | T9 | Blank |
| P2 | Arjun Das | 0.60000000 | 2026-09-03 | Current | T9 | Blank |
| P3 | Rohan Iyer | 0.60000000 | 2026-09-04 | Current | T10 | Blank |
| P3 | Ananya Devi | 0.40000000 | 2026-09-04 | Current | T10 | Blank |
| P4 | Priya Nair | 1.00000000 | 2026-09-05 | Current | T11 | Blank |

Valid-from is inclusive and valid-to is exclusive. When P1 undergoes the second partial transfer, Meera's unchanged 25% holding remains open from 1 September; it is not recreated. When P2 is sold to an existing co-owner, both affected prior holdings close and two replacement holdings open.

## 11. Relationship coverage: all 18 tables and 37 foreign keys

The workbook has manual data for every editable entity. The app creates ownership and audit rows, and account creation writes users. To exercise all 37 foreign keys, create at least the linked owner and one linked officer account from section 2; otherwise those two account-profile links have no new example. It exercises the following links without inserting or fabricating foreign-key UUIDs.

| Child table | Parent links exercised | Example |
|---|---|---|
| offices | district_id → districts | OFF-CH → Chennai |
| officers | office_id → offices | R-CH / S-CH / V-CH / A-CH → OFF-CH |
| properties | district_id → districts; office_id → offices | P1 → D-CH + OFF-CH |
| transactions | property_id → properties; office_id → offices; approving_officer_id → officers | T1 → P1 + OFF-CH + R-CH after approval |
| documents | property_id → properties; transaction_id → transactions; verifying_officer_id → officers | DOC-T1 → P1 + T1 + R-CH |
| surveys | property_id → properties; officer_id → officers | SUR-1 → P1 + S-CH |
| valuations | property_id → properties; officer_id → officers | VAL-1 → P1 + V-CH |
| tax_payments | property_id → properties; payer_owner_id → owners | TAX-1 → P1 + O-A |
| encumbrances | property_id → properties; document_id → documents | ENC-1 → P4 + DOC-CLAIM-4 |
| mutations | property_id → properties; transaction_id → transactions; approving_officer_id → officers | Generated T7 mutation → P1 + T7 + R-CH after review |
| ownerships | property_id → properties; owner_id → owners; source_transaction_id → transactions; end_transaction_id → transactions | Aarav's first P1 holding → P1 + O-A + T1 + T7 |
| transaction_parties | transaction_id → transactions; owner_id → owners | T7 transferor → T7 + O-A |
| users | owner_id → owners; officer_id → officers | trn.aarav → O-A; trn.suresh → S-CH |
| audit_events | actor_id → users | Actions by your signed-in administrator |
| applications | applicant_owner_id → owners; property_id → properties; transaction_id → transactions; reviewing_officer_id → officers | APP-T7 → O-A + P1 + T7 + R-CH |
| certificates | property_id → properties; issuing_officer_id → officers; application_id → applications | EC-1 → P1 + R-CH + APP-EC-1 |

Districts and owners are independent parent tables. Optional references are intentionally blank in unlinked survey/mortgage documents, manual boundary/correction mutations, mutation/certificate applications and EC-2. Never fill optional transaction fields just to make every cell nonempty.

## 12. Manual cross-checks and deliberately invalid cases

Run these on this fictional dataset. Cancel incorrect forms, or correct their values before saving. A failed approval can leave its already saved Pending transaction, parties and documents intact; it must not alter registered ownership. Additional successful test records are outside the baseline counts. This covers representative cases; no finite data file proves every possible input or vulnerability is handled.

| Check | What to try | Expected behavior |
|---|---|---|
| Required input | New owner with empty Full name, or property with empty boundaries | Required-field validation; no new row |
| Unique identification | New owner with TRAIN-TN-ID-001 | Duplicate rejected |
| Unique business numbers | Reuse TRN-TN-ADY-01, TRN-DEED-2026-001, TRN-REC-001 or TRN-EC-2026-001 | Duplicate rejected in respective module |
| District-office link | Choose Chennai then look for OFF-TH in a property form | Wrong-district office filtered out; backend also enforces the relation |
| Officer designation | In a Survey form look for R-CH as the surveying officer | Registrar excluded; survey officer required |
| Officer jurisdiction | In a P1 survey look for S-TH | Wrong-office surveyor excluded; matching office enforced |
| Inactive officer | Create a spare training officer, set Inactive and inspect survey/review choices | Inactive officer unavailable; spare row is outside baseline |
| Area | Try 0, -1 or 240.12345 | Positive area and at most 4 decimal places required |
| Money | Try negative consideration or 6800.501 as a tax amount | Nonnegative consideration; positive tax; at most 2 decimal places |
| Tax year | Try 1899, 2201 or 2026.5 | Integer year between 1900 and 2200 required |
| Date | Try tomorrow as a new valuation/document/payment date or a Completed survey date | Future recorded date rejected |
| Scheduled date | A future Scheduled survey, on a temporary new row | Allowed as scheduling; do not change a completed historical row |
| Email | Try not-an-email in an owner profile | Invalid email format rejected |
| Missing upload | Verify DOC-T5 without uploading | Rejected; document remains Pending |
| Wrong upload content | Attempt an ordinary .txt file renamed .pdf | Rejected by content signature checks; a renamed file is not a PDF |
| Upload size | Try a PDF larger than 10 MB | Upload rejected |
| Registration parties | On a temporary pending registration, try a Transferor | Rejected; initial registration has transferees only |
| Registration shares | On a temporary pending registration, give transferees only 0.70 total and prepare a verified matching deed, then Approve | Rejected; incoming total must be exactly 1 |
| Individual share | Enter 0, 1.01 or 0.123456789 | Share must be greater than 0, at most 1 and at most 8 decimal places |
| Transfer balance | On a temporary P1 sale, outgoing 0.10 and incoming 0.20; prepare verified sale deed and Approve | Rejected; totals must match |
| Over-selling | On a temporary P1 sale, Aarav transfers 0.75 although his current holding is 0.50 | Approval rejected; cannot transfer more than current holding |
| Same owner on both sides | Temporary P1 transfer with Aarav both transferor and transferee | Approval rejected |
| Duplicate party | Add the same owner and party role twice to a temporary Pending transaction | Duplicate rejected |
| Transfer chronology | Temporary P1 sale dated 2026-08-15 with balanced parties and verified matching deed | Approval rejected because current holdings began later |
| Deed type | On a temporary Sale transaction upload/verify only a Gift deed, then Approve | Rejected; matching Sale deed required |
| Every attached document | On a temporary pending transaction verify its matching deed but leave a second attached document Pending | Approval rejected until all attached documents are Verified |
| Blocked property | Approve T12 with its verified Sale deed | Active mortgage blocks approval; Priya still owns 100% of P4 |
| Claim dates | Try Released claim without End date, or End date before Start date | Rejected |
| Document-property link | Select P1 in a claim and inspect supporting documents / related transactions | Documents and transactions from other properties are filtered out; backend checks links |
| Frozen history | Open approved T1, verified DOC-T1, Paid TAX-1, Completed SUR-1 and issued EC-1 | Ordinary Edit unavailable; finalized history preserved |
| Premature application approval | Approve APP-T5 without approved T5; approve an EC application before issuing its certificate | Rejected until linked workflow is completed |
| Ownership mutation link | New Ownership change mutation without Related transaction | Required transaction rejected if missing; approval requires approved linked transaction |
| Certificate dates | Period to before Period from, or extending into tomorrow | Rejected |
| Snapshot retention | Inspect EC-4 while ENC-1 is Active | Recorded snapshot includes mortgage; certificate does not resolve it |
| Deleting a referenced parent | As admin, attempt to delete a workbook owner/office with dependent records | Foreign-key protection rejects deletion; do not delete unlinked successful baseline rows |
| Public access | Log in as trn.public | Only four registered workbook properties; basic survey/district/type/area/registration data; no precise location, private owners, documents, claims, audit, accounts or bulk export |
| Owner access | Log in as trn.aarav | P1 and its related records/applications available; P2–P6 unavailable to this owner; other owners' private identity/contact fields hidden |
| Survey/valuation write roles | Use trn.suresh / trn.nandhini | Relevant writes use own linked officer and office; read scope follows the current department role model |
| Bank access | Log in as trn.bank | Read-only property/ownership/claim verification; private owner contact/identity fields hidden; no uploaded document access or account controls |
| Auditor access | Log in as trn.ganesh | Registry/audit read-only; no account creation or record-edit controls |
| Privileged account creation | Inspect User accounts while logged in as Public, Owner or other non-admin role | No account-management control; backend requires an administrator |
| Reserved signup name | Public Create account with anything@landledger.local | Signup rejected; this suffix remains usable for admin-created accounts signing in |
| Search injection string | Search for ' OR '1'='1 | Treated as a literal search value, not a bypass; no unrelated data is exposed |
| Stored HTML | Optional temporary owner named `<script>alert(1)</script>` | Displayed as text; no script executes. Delete this unlinked extra test owner afterwards |

For SQL-injection checks, enter the search string in the app only; do not paste it into a database console. The guide does not expose real credentials and does not require bypassing role checks. Avoid repeated bad login attempts that trigger the rate limiter while you are learning the workflow.

## Completion checklist

- [ ] All training office/property/officer assignments match districts and offices.
- [ ] All four property types and four transaction types are present.
- [ ] Every approved transaction has correct parties and uploaded, verified matching evidence.
- [ ] Each registered property's current ownership totals 100%.
- [ ] Ownership periods/source and end transactions match the history table above.
- [ ] No ownership change occurred for Pending T5, blocked T12 or Rejected T6.
- [ ] The five generated transfer mutations were reviewed without adding duplicates.
- [ ] Certificates contain the expected overlapping claims and preserve their snapshots.
- [ ] Audit events show the actual signed-in actor for successful changes.
- [ ] Role accounts show the expected views and cannot access administrator account management.
- [ ] Public directory exposes the chosen limited fields for registered properties only.

## What this workbook does not change

No schema changes are required. It uses the current 18 tables and 37 foreign keys. It does not add database records, run the demo seed, connect to CockroachDB or create accounts for you. It is an entry and verification plan checked offline against the app's current field validation, reference structure and ownership-share arithmetic. Actual UI results must still be observed during your manual entry.
