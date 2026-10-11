export type Role =
  | "public_viewer"
  | "administrator"
  | "owner"
  | "survey_officer"
  | "valuation_officer"
  | "sub_registrar"
  | "bank_verifier"
  | "auditor";
export type Actor = {
  id: string;
  username: string;
  role: Role;
  owner_id: string | null;
  officer_id: string | null;
};
export type Field = {
  key: string;
  label: string;
  type:
    | "text"
    | "textarea"
    | "date"
    | "number"
    | "email"
    | "select"
    | "reference"
    | "boolean"
    | "json";
  required?: boolean;
  options?: string[];
  reference?: string;
  readOnly?: boolean;
  min?: number;
  scale?: number;
  designation?: string;
};
export type Resource = {
  key: string;
  title: string;
  singular: string;
  description: string;
  fields: Field[];
  columns: string[];
  primary?: boolean;
  label: string;
  writes: Role[];
  reads?: Role[];
};
const field = (
  key: string,
  label: string,
  type: Field["type"] = "text",
  extra: Partial<Field> = {},
): Field => ({ key, label, type, required: true, ...extra });
const ref = (
  key: string,
  label: string,
  reference: string,
  extra: Partial<Field> = {},
) => field(key, label, "reference", { reference, ...extra });
const select = (
  key: string,
  label: string,
  options: string[],
  extra: Partial<Field> = {},
) => field(key, label, "select", { options, ...extra });
const date = (key: string, label: string, extra: Partial<Field> = {}) =>
  field(key, label, "date", extra);
const text = (key: string, label: string, extra: Partial<Field> = {}) =>
  field(key, label, "text", extra);
const notes = (key = "remarks", label = "Remarks") =>
  field(key, label, "textarea", { required: false });
const amount = (key: string, label: string, min = 0, scale = 2) =>
  field(key, label, "number", { min, scale });
const admin: Role[] = ["administrator"];
const registrar: Role[] = ["administrator", "sub_registrar"];
const primary = (r: Omit<Resource, "primary">): Resource => ({
  ...r,
  primary: true,
});
const property = () => ref("property_id", "Property", "properties");
const officer = (designation?: string, key = "officer_id", label = "Officer") =>
  ref(key, label, "officers", { designation });
const optionalContact: Field[] = [
  text("phone", "Phone", { required: false }),
  field("email", "Email", "email", { required: false }),
];
export const resources: Resource[] = [
  primary({
    key: "properties",
    title: "Properties",
    singular: "Property",
    description: "Land parcels and registration details, all in one place.",
    label: "survey_no",
    writes: [...registrar, "owner"],
    columns: [
      "survey_no",
      "property_type",
      "location",
      "area",
      "registration_status",
    ],
    fields: [
      text("survey_no", "Survey number"),
      select("property_type", "Property type", [
        "residential",
        "commercial",
        "agricultural",
        "industrial",
      ]),
      amount("area", "Area (m²)", 0.0001, 4),
      text("location", "Location"),
      ref("district_id", "District", "districts"),
      ref("office_id", "Registration office", "offices"),
      field("boundary_details", "Boundary details", "textarea"),
      date("registration_date", "Registered on", {
        required: false,
        readOnly: true,
      }),
      select(
        "registration_status",
        "Registration status",
        ["pending", "registered", "rejected"],
        { readOnly: true },
      ),
    ],
  }),
  primary({
    key: "owners",
    title: "Owners",
    singular: "Owner",
    description: "Owner profiles, contact information and property holdings.",
    label: "owner_name",
    writes: registrar,
    columns: ["owner_name", "identification_no", "phone", "email"],
    fields: [
      text("owner_name", "Full name"),
      text("identification_no", "Identification number"),
      field("address", "Address", "textarea"),
      ...optionalContact,
    ],
  }),
  primary({
    key: "districts",
    title: "Districts",
    singular: "District",
    description: "The administrative districts covered by the registry.",
    label: "district_name",
    writes: admin,
    columns: ["district_name", "state_name"],
    fields: [
      text("district_name", "District name"),
      text("state_name", "State name"),
    ],
  }),
  primary({
    key: "offices",
    title: "Offices",
    singular: "Office",
    description: "Registration offices and their district jurisdictions.",
    label: "office_name",
    writes: admin,
    columns: ["office_name", "office_code", "district_id", "phone"],
    fields: [
      text("office_name", "Office name"),
      text("office_code", "Office code"),
      ref("district_id", "District", "districts"),
      field("address", "Address", "textarea"),
      text("phone", "Phone", { required: false }),
    ],
  }),
  primary({
    key: "officers",
    title: "Officers",
    singular: "Officer",
    description: "Authorized survey, valuation and registration officers.",
    label: "officer_name",
    writes: admin,
    columns: ["officer_name", "designation", "office_id", "active"],
    fields: [
      text("officer_name", "Full name"),
      select("designation", "Designation", [
        "survey_officer",
        "valuation_officer",
        "sub_registrar",
        "auditor",
      ]),
      ref("office_id", "Office", "offices"),
      ...optionalContact,
      field("active", "Active", "boolean"),
    ],
  }),
  primary({
    key: "transactions",
    title: "Transactions",
    singular: "Transaction",
    description:
      "Registration and ownership transfers with a verifiable history.",
    label: "transaction_type",
    writes: [...registrar, "owner"],
    columns: [
      "property_id",
      "transaction_type",
      "transaction_date",
      "consideration",
      "status",
    ],
    fields: [
      property(),
      ref("office_id", "Processing office", "offices"),
      select("transaction_type", "Transaction type", [
        "registration",
        "sale",
        "inheritance",
        "gift",
      ]),
      date("transaction_date", "Transaction date"),
      amount("consideration", "Declared consideration (₹)"),
      notes(),
      select("status", "Status", ["pending", "approved", "rejected"], {
        readOnly: true,
      }),
      ref("approving_officer_id", "Approving officer", "officers", {
        required: false,
        readOnly: true,
      }),
      date("approval_date", "Approval date", {
        required: false,
        readOnly: true,
      }),
    ],
  }),
  primary({
    key: "documents",
    title: "Documents",
    singular: "Document",
    description: "Registered deeds, legal records and secure digital copies.",
    label: "document_no",
    writes: [...registrar, "owner"],
    columns: [
      "document_no",
      "document_type",
      "property_id",
      "verification_status",
      "document_date",
    ],
    fields: [
      text("document_no", "Document number"),
      property(),
      ref("transaction_id", "Related transaction", "transactions", {
        required: false,
      }),
      select("document_type", "Document type", [
        "registration_deed",
        "sale_deed",
        "inheritance_deed",
        "gift_deed",
        "survey_report",
        "identity_proof",
        "other",
      ]),
      date("document_date", "Document date"),
      select(
        "verification_status",
        "Verification status",
        ["pending", "verified", "rejected"],
        { readOnly: true },
      ),
      ref("verifying_officer_id", "Verified by", "officers", {
        required: false,
        readOnly: true,
      }),
      date("verified_date", "Verified on", { required: false, readOnly: true }),
    ],
  }),
  primary({
    key: "surveys",
    title: "Surveys",
    singular: "Survey",
    description: "Survey measurements, boundary information and field updates.",
    label: "survey_no",
    writes: ["administrator", "survey_officer"],
    columns: [
      "survey_no",
      "property_id",
      "survey_date",
      "survey_area",
      "survey_status",
    ],
    fields: [
      property(),
      officer("survey_officer"),
      text("survey_no", "Survey number"),
      date("survey_date", "Survey date"),
      amount("survey_area", "Survey area (m²)", 0.0001, 4),
      field("boundary_details", "Boundary details", "textarea"),
      select("survey_status", "Status", ["scheduled", "completed"]),
    ],
  }),
  primary({
    key: "valuations",
    title: "Valuations",
    singular: "Valuation",
    description: "Market assessments and the complete valuation history.",
    label: "valuation_date",
    writes: ["administrator", "valuation_officer"],
    columns: [
      "property_id",
      "market_value",
      "valuation_date",
      "valuation_purpose",
    ],
    fields: [
      property(),
      officer("valuation_officer"),
      date("valuation_date", "Valuation date"),
      amount("market_value", "Market value (₹)"),
      text("valuation_purpose", "Purpose"),
      notes(),
    ],
  }),
  primary({
    key: "tax_payments",
    title: "Tax payments",
    singular: "Tax payment",
    description: "Recorded tax receipts and payment status by financial year.",
    label: "receipt_no",
    writes: registrar,
    columns: [
      "receipt_no",
      "property_id",
      "tax_year",
      "amount",
      "payment_status",
    ],
    fields: [
      property(),
      ref("payer_owner_id", "Payer", "owners"),
      amount("tax_year", "Tax year", 1900, 0),
      date("payment_date", "Payment date"),
      amount("amount", "Amount (₹)", 0.01),
      select("payment_status", "Payment status", ["pending", "paid", "failed"]),
      text("receipt_no", "Receipt number"),
      text("payment_reference", "Payment reference", { required: false }),
    ],
  }),
  primary({
    key: "encumbrances",
    title: "Encumbrances",
    singular: "Encumbrance",
    description: "Mortgages, liens and disputes attached to a property.",
    label: "claimant_name",
    writes: registrar,
    columns: [
      "property_id",
      "encumbrance_type",
      "claimant_name",
      "start_date",
      "status",
    ],
    fields: [
      property(),
      ref("document_id", "Supporting document", "documents", {
        required: false,
      }),
      select("encumbrance_type", "Claim type", [
        "mortgage",
        "lien",
        "dispute",
        "other",
      ]),
      text("claimant_name", "Claimant"),
      date("start_date", "Start date"),
      date("end_date", "End date", { required: false }),
      select("status", "Status", ["active", "released"]),
      field("details", "Details", "textarea"),
    ],
  }),
  primary({
    key: "mutations",
    title: "Mutations",
    singular: "Mutation",
    description: "Changes to registered ownership and property records.",
    label: "mutation_type",
    writes: registrar,
    columns: ["property_id", "mutation_type", "mutation_date", "status"],
    fields: [
      property(),
      ref("transaction_id", "Related transaction", "transactions", {
        required: false,
      }),
      date("mutation_date", "Mutation date"),
      select("mutation_type", "Mutation type", [
        "ownership_change",
        "boundary_update",
        "correction",
      ]),
      field("description", "Description", "textarea"),
      select("status", "Status", ["pending", "approved", "rejected"], {
        readOnly: true,
      }),
      ref("approving_officer_id", "Approved by", "officers", {
        required: false,
        readOnly: true,
      }),
    ],
  }),
  {
    key: "ownerships",
    title: "Ownership history",
    singular: "Ownership",
    description:
      "Dated ownership shares, retained after every approved transfer.",
    label: "owner_id",
    writes: [],
    columns: ["property_id", "owner_id", "share", "valid_from", "valid_to"],
    fields: [
      property(),
      ref("owner_id", "Owner", "owners"),
      amount("share", "Ownership share", 0.00000001, 8),
      date("valid_from", "Valid from"),
      date("valid_to", "Valid to", { required: false }),
    ],
  },
  {
    key: "transaction_parties",
    title: "Transaction parties",
    singular: "Party",
    description:
      "Transferors and transferees, including joint owners and multiple heirs.",
    label: "owner_id",
    writes: [...registrar, "owner"],
    columns: ["owner_id", "role", "share"],
    fields: [
      ref("transaction_id", "Transaction", "transactions"),
      ref("owner_id", "Owner", "owners"),
      select("role", "Party role", ["transferor", "transferee"]),
      amount("share", "Share (1 = 100%)", 0.00000001, 8),
    ],
  },
  {
    key: "applications",
    title: "Service applications",
    singular: "Application",
    description: "Property services submitted through the online portal.",
    label: "service_type",
    writes: [...registrar, "owner"],
    columns: ["property_id", "service_type", "submitted_date", "status"],
    fields: [
      ref("applicant_owner_id", "Applicant", "owners"),
      property(),
      select("service_type", "Service type", [
        "registration",
        "transfer",
        "mutation",
        "encumbrance_certificate",
      ]),
      date("submitted_date", "Submitted on"),
      ref("transaction_id", "Related transaction", "transactions", {
        required: false,
      }),
      notes("notes", "Notes"),
      select(
        "status",
        "Status",
        ["submitted", "under_review", "approved", "rejected"],
        { readOnly: true },
      ),
      ref("reviewing_officer_id", "Reviewing officer", "officers", {
        required: false,
        readOnly: true,
      }),
    ],
  },
  {
    key: "certificates",
    title: "Encumbrance certificates",
    singular: "Certificate",
    description:
      "Issued certificates preserve a snapshot for the selected period.",
    label: "certificate_no",
    writes: registrar,
    columns: [
      "certificate_no",
      "property_id",
      "period_from",
      "period_to",
      "issue_date",
    ],
    fields: [
      text("certificate_no", "Certificate number"),
      property(),
      date("period_from", "Period from"),
      date("period_to", "Period to"),
      ref("application_id", "Related application", "applications", {
        required: false,
      }),
      date("issue_date", "Issued on", { readOnly: true }),
      ref("issuing_officer_id", "Issued by", "officers", { readOnly: true }),
      field("snapshot_summary", "Recorded claims", "json", { readOnly: true }),
    ],
  },
  {
    key: "audit_events",
    title: "Audit trail",
    singular: "Audit event",
    description: "A record of who changed what and when.",
    label: "action",
    writes: [],
    reads: ["administrator", "auditor", "sub_registrar"],
    columns: ["occurred_at", "action", "entity_type", "actor_id"],
    fields: [
      text("action", "Action"),
      text("entity_type", "Record type"),
      text("entity_id", "Record ID"),
      date("occurred_at", "Time"),
      field("summary", "Summary", "json"),
    ],
  },
];
export const resourceMap = new Map(
  resources.map((resource) => [resource.key, resource]),
);
export function canRead(actor: Actor, resource: Resource) {
  if (actor.role === "public_viewer") return false;
  if (resource.reads) return resource.reads.includes(actor.role);
  if (actor.role === "bank_verifier")
    return [
      "properties",
      "districts",
      "offices",
      "ownerships",
      "owners",
      "encumbrances",
      "certificates",
    ].includes(resource.key);
  if (actor.role === "owner") return !["officers"].includes(resource.key);
  return true;
}
export function canWrite(actor: Actor, resource: Resource) {
  return resource.writes.includes(actor.role);
}
