import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { pool, transaction, assertCockroach } from "./db.js";
import { config } from "./config.js";
import { hashPassword } from "./auth.js";
import { insert, audit } from "./business.js";
import type { Actor } from "./resources.js";

// A small, valid one-page PDF. Deliberately fictional; never an official deed.
function samplePdf() {
  const content =
    "BT /F1 22 Tf 50 740 Td (LANDLEDGER DEMONSTRATION) Tj /F1 12 Tf 0 -38 Td (Fictional sample document for a student DBMS project.) Tj 0 -25 Td (Not an official land record or a legally valid deed.) Tj 0 -25 Td (Use this file to demonstrate uploads and verification.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const start = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, "0")} 00000 n `)
    .join(
      "\n",
    )}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(pdf);
}
function daysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

try {
  if (config.production)
    throw new Error("Demo seed is disabled in production.");
  await assertCockroach();
  const password = process.env.DEMO_ADMIN_PASSWORD || "LandLedger@2026";
  if (password.length < 12)
    throw new Error("DEMO_ADMIN_PASSWORD must contain at least 12 characters.");
  const existing = await pool.query(
    "SELECT (SELECT count(*) FROM users)+(SELECT count(*) FROM properties)+(SELECT count(*) FROM owners) AS count",
  );
  if (Number(existing.rows[0].count) > 0) {
    const seeded = await pool.query(
      "SELECT id FROM properties WHERE survey_no='DEMO-1001'",
    );
    if (seeded.rows.length)
      console.log(
        "Demo records already exist. Existing data was left unchanged.",
      );
    else
      throw new Error(
        "Refusing to seed a non-empty registry. Use a separate empty database for sample records.",
      );
  } else {
    await mkdir(config.uploads, { recursive: true });
    const fileKey = `${randomUUID()}.pdf`;
    const file = samplePdf();
    await writeFile(path.join(config.uploads, fileKey), file, { mode: 0o600 });
    await transaction(async (client) => {
      const districts = [];
      const offices = [];
      const registrars = [];
      const surveyors = [];
      const valuers = [];
      for (const [index, name] of [
        "Chennai",
        "Coimbatore",
        "Madurai",
        "Thanjavur",
      ].entries()) {
        const district = await insert(client, "districts", {
          district_name: name,
          state_name: "Tamil Nadu",
        });
        districts.push(district);
        const office = await insert(client, "offices", {
          office_name: `${name} Central Registry`,
          office_code: `DEMO-OFF-${index + 1}`,
          district_id: district.id,
          address: `Demonstration Registry Road, ${name}`,
          phone: `0440000000${index}`,
        });
        offices.push(office);
        registrars.push(
          await insert(client, "officers", {
            officer_name: `Demo Registrar ${index + 1}`,
            designation: "sub_registrar",
            office_id: office.id,
            email: `registrar${index + 1}@example.test`,
            active: true,
          }),
        );
        surveyors.push(
          await insert(client, "officers", {
            officer_name: `Demo Surveyor ${index + 1}`,
            designation: "survey_officer",
            office_id: office.id,
            active: true,
          }),
        );
        valuers.push(
          await insert(client, "officers", {
            officer_name: `Demo Valuer ${index + 1}`,
            designation: "valuation_officer",
            office_id: office.id,
            active: true,
          }),
        );
      }
      const auditor = await insert(client, "officers", {
        officer_name: "Demo Audit Officer",
        designation: "auditor",
        office_id: offices[0].id,
        active: true,
      });
      const owners = [];
      for (const [i, name] of [
        "Aarav Kumar",
        "Meera Raman",
        "Kavin Raj",
        "Ananya Devi",
        "Vikram Sen",
        "Priya Nair",
        "Arjun Das",
        "Diya Menon",
        "Rohan Iyer",
      ].entries()) {
        owners.push(
          await insert(client, "owners", {
            owner_name: name,
            identification_no: `DEMO-ID-${String(i + 1).padStart(4, "0")}`,
            address: `Fictional sample address ${i + 1}, Tamil Nadu`,
            phone: `90000000${String(i + 1).padStart(2, "0")}`,
            email: `owner${i + 1}@example.test`,
          }),
        );
      }
      const bankOfficer = await insert(client, "officers", {
        officer_name: "Demo Bank Verifier",
        designation: "bank_verifier",
        office_id: offices[0].id,
        email: "bank@example.test",
        phone: "9000000099",
        active: true,
      });
      const admin = await insert(client, "users", {
        username: "admin@landledger.local",
        password_hash: hashPassword(password),
        role: "administrator",
      });
      const actor: Actor = {
        id: admin.id,
        username: admin.username,
        role: "administrator",
        owner_id: null,
        officer_id: null,
      };
      for (const user of [
        {
          username: "owner@landledger.local",
          role: "owner",
          owner_id: owners[0].id,
        },
        {
          username: "registrar@landledger.local",
          role: "sub_registrar",
          officer_id: registrars[0].id,
        },
        {
          username: "surveyor@landledger.local",
          role: "survey_officer",
          officer_id: surveyors[0].id,
        },
        {
          username: "valuer@landledger.local",
          role: "valuation_officer",
          officer_id: valuers[0].id,
        },
        {
          username: "bank@landledger.local",
          role: "bank_verifier",
          officer_id: bankOfficer.id,
        },
        {
          username: "auditor@landledger.local",
          role: "auditor",
          officer_id: auditor.id,
        },
      ])
        await insert(client, "users", {
          ...user,
          password_hash: hashPassword(password),
        });
      const types = ["residential", "commercial", "agricultural", "industrial"];
      const locations = [
        "Adyar",
        "Anna Nagar",
        "RS Puram",
        "Peelamedu",
        "KK Nagar",
        "Tallakulam",
        "Papanasam",
        "Kumbakonam",
      ];
      for (let i = 0; i < 24; i++) {
        const d = i % 4;
        const registered = i < 20;
        const day = daysAgo(120 - i * 3);
        const property = await insert(client, "properties", {
          survey_no: `DEMO-${1001 + i}`,
          property_type: types[i % 4],
          area: String(180 + i * 35),
          location: `${locations[(d * 2 + (i % 2)) % locations.length]}, ${districts[d].district_name}`,
          boundary_details: `North: sample access road; South: adjoining parcel; East: survey marker ${i + 1}; West: sample public pathway.`,
          district_id: districts[d].id,
          office_id: offices[d].id,
          registration_status: registered ? "registered" : "pending",
          registration_date: registered ? day : null,
          created_at: day,
        });
        const tx = await insert(client, "transactions", {
          property_id: property.id,
          office_id: offices[d].id,
          transaction_type: "registration",
          transaction_date: day,
          consideration: String(1500000 + i * 200000),
          status: registered ? "approved" : "pending",
          approving_officer_id: registered ? registrars[d].id : null,
          approval_date: registered ? day : null,
          remarks: "Fictional sample registration for demonstration.",
        });
        const owner = owners[i % owners.length];
        await insert(client, "transaction_parties", {
          transaction_id: tx.id,
          owner_id: owner.id,
          role: "transferee",
          share: "1",
        });
        if (registered)
          await insert(client, "ownerships", {
            property_id: property.id,
            owner_id: owner.id,
            share: "1",
            valid_from: day,
            source_transaction_id: tx.id,
          });
        const document = await insert(client, "documents", {
          document_no: `DEMO-DEED-${1001 + i}`,
          property_id: property.id,
          transaction_id: tx.id,
          document_type: "registration_deed",
          document_date: day,
          verification_status: registered ? "verified" : "pending",
          verifying_officer_id: registered ? registrars[d].id : null,
          verified_date: registered ? day : null,
          file_key: fileKey,
          original_filename: "fictional-sample-deed.pdf",
          media_type: "application/pdf",
          file_size: file.length,
          sha256: createHash("sha256").update(file).digest("hex"),
        });
        await insert(client, "surveys", {
          property_id: property.id,
          officer_id: surveyors[d].id,
          survey_no: `DEMO-SUR-${1001 + i}`,
          survey_date: day,
          survey_area: String(180 + i * 35),
          boundary_details: property.boundary_details,
          survey_status: registered ? "completed" : "scheduled",
        });
        await insert(client, "valuations", {
          property_id: property.id,
          officer_id: valuers[d].id,
          valuation_date: daysAgo(30),
          market_value: String(1800000 + i * 210000),
          valuation_purpose: "Registration and taxation",
          remarks: "Fictional demonstration valuation.",
        });
        if (registered)
          await insert(client, "tax_payments", {
            property_id: property.id,
            payer_owner_id: owner.id,
            tax_year: new Date().getUTCFullYear(),
            payment_date: daysAgo(15 + i),
            amount: String(7500 + i * 500),
            payment_status: i % 5 === 0 ? "pending" : "paid",
            receipt_no: `DEMO-REC-${1001 + i}`,
            payment_reference: `DEMO-PAY-${i + 1}`,
          });
        if (i === 5 || i === 10 || i === 15)
          await insert(client, "encumbrances", {
            property_id: property.id,
            document_id: document.id,
            encumbrance_type: i === 15 ? "dispute" : "mortgage",
            claimant_name:
              i === 15 ? "Fictional claimant" : "Demonstration Bank",
            start_date: daysAgo(50),
            status: "active",
            details:
              "Fictional active claim. Resolve this claim before demonstrating a transfer.",
          });
        if (i === 6)
          await insert(client, "encumbrances", {
            property_id: property.id,
            encumbrance_type: "lien",
            claimant_name: "Demonstration agency",
            start_date: daysAgo(80),
            end_date: daysAgo(30),
            status: "released",
            details: "Fictional released claim retained in history.",
          });
        if (i < 4)
          await insert(client, "mutations", {
            property_id: property.id,
            transaction_id: tx.id,
            mutation_date: daysAgo(12 - i),
            mutation_type: "ownership_change",
            description: "Fictional ownership record review.",
            status: i === 0 ? "pending" : "approved",
            approving_officer_id: i === 0 ? null : registrars[d].id,
          });
        if (!registered)
          await insert(client, "applications", {
            applicant_owner_id: owner.id,
            property_id: property.id,
            service_type: "registration",
            status: "submitted",
            submitted_date: day,
            transaction_id: tx.id,
            notes: "Demonstration registration application.",
          });
        if (i === 0) {
          const application = await insert(client, "applications", {
            applicant_owner_id: owner.id,
            property_id: property.id,
            service_type: "encumbrance_certificate",
            status: "approved",
            submitted_date: daysAgo(10),
            reviewing_officer_id: registrars[0].id,
          });
          await insert(client, "certificates", {
            certificate_no: "DEMO-EC-0001",
            property_id: property.id,
            period_from: daysAgo(365),
            period_to: daysAgo(1),
            issue_date: daysAgo(1),
            issuing_officer_id: registrars[0].id,
            application_id: application.id,
            snapshot_summary: JSON.stringify({
              claims: [],
              note: "Fictional sample certificate; not an official legal document.",
            }),
          });
        }
        if (i >= 19)
          await audit(
            client,
            actor,
            registered ? "approve" : "create",
            "properties",
            property.id,
            { source: "fictional_demo_seed" },
          );
      }
    });
    console.log(
      "Created fictional demonstration records and seven role accounts. See README for demo sign-in details.",
    );
  }
} finally {
  await pool.end();
}
