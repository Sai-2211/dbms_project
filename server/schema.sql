-- Approved initial schema: twelve primary entities and six supporting tables.
-- Run against an existing CockroachDB database. No DROP statements.
CREATE TABLE IF NOT EXISTS districts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), district_name STRING NOT NULL,
  state_name STRING NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(state_name, district_name)
);
CREATE TABLE IF NOT EXISTS offices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), office_name STRING NOT NULL,
  office_code STRING NOT NULL UNIQUE, district_id UUID NOT NULL REFERENCES districts(id),
  address STRING NOT NULL, phone STRING, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), owner_name STRING NOT NULL,
  identification_no STRING NOT NULL UNIQUE, address STRING NOT NULL,
  phone STRING, email STRING, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS officers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), officer_name STRING NOT NULL,
  designation STRING NOT NULL CONSTRAINT officers_designation_allowed CHECK (designation IN ('survey_officer','valuation_officer','sub_registrar','auditor','bank_verifier')),
  office_id UUID NOT NULL REFERENCES offices(id), email STRING, phone STRING,
  active BOOL NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), survey_no STRING NOT NULL,
  property_type STRING NOT NULL CHECK (property_type IN ('residential','commercial','agricultural','industrial')),
  area DECIMAL(18,4) NOT NULL CHECK (area > 0), location STRING NOT NULL,
  boundary_details STRING NOT NULL, district_id UUID NOT NULL REFERENCES districts(id),
  office_id UUID NOT NULL REFERENCES offices(id), registration_date DATE,
  registration_status STRING NOT NULL DEFAULT 'pending' CHECK (registration_status IN ('pending','registered','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), property_id UUID NOT NULL REFERENCES properties(id),
  office_id UUID NOT NULL REFERENCES offices(id), transaction_type STRING NOT NULL
    CHECK (transaction_type IN ('registration','sale','inheritance','gift')),
  transaction_date DATE NOT NULL, consideration DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (consideration >= 0),
  status STRING NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  approving_officer_id UUID REFERENCES officers(id), approval_date DATE, remarks STRING,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'approved' AND approving_officer_id IS NOT NULL AND approval_date IS NOT NULL)
    OR (status != 'approved' AND approving_officer_id IS NULL AND approval_date IS NULL))
);
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), document_no STRING NOT NULL UNIQUE,
  property_id UUID NOT NULL REFERENCES properties(id), transaction_id UUID REFERENCES transactions(id),
  document_type STRING NOT NULL CHECK (document_type IN ('registration_deed','sale_deed','inheritance_deed','gift_deed','survey_report','identity_proof','other')),
  document_date DATE NOT NULL, verification_status STRING NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending','verified','rejected')),
  verifying_officer_id UUID REFERENCES officers(id), verified_date DATE,
  file_key STRING, original_filename STRING, media_type STRING, file_size INT8 CHECK(file_size > 0), sha256 STRING,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((verification_status = 'verified' AND verifying_officer_id IS NOT NULL AND verified_date IS NOT NULL)
    OR (verification_status != 'verified' AND verifying_officer_id IS NULL AND verified_date IS NULL))
);
CREATE TABLE IF NOT EXISTS surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), property_id UUID NOT NULL REFERENCES properties(id),
  officer_id UUID NOT NULL REFERENCES officers(id), survey_no STRING NOT NULL, survey_date DATE NOT NULL,
  survey_area DECIMAL(18,4) NOT NULL CHECK(survey_area > 0), boundary_details STRING NOT NULL,
  survey_status STRING NOT NULL DEFAULT 'scheduled' CHECK(survey_status IN ('scheduled','completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS valuations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), property_id UUID NOT NULL REFERENCES properties(id),
  officer_id UUID NOT NULL REFERENCES officers(id), valuation_date DATE NOT NULL,
  market_value DECIMAL(18,2) NOT NULL CHECK(market_value >= 0), valuation_purpose STRING NOT NULL,
  remarks STRING, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tax_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), property_id UUID NOT NULL REFERENCES properties(id),
  payer_owner_id UUID NOT NULL REFERENCES owners(id), tax_year INT NOT NULL CHECK(tax_year BETWEEN 1900 AND 2200),
  payment_date DATE NOT NULL, amount DECIMAL(18,2) NOT NULL CHECK(amount > 0),
  payment_status STRING NOT NULL CHECK(payment_status IN ('pending','paid','failed')),
  receipt_no STRING NOT NULL UNIQUE, payment_reference STRING,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS encumbrances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), property_id UUID NOT NULL REFERENCES properties(id),
  document_id UUID REFERENCES documents(id), encumbrance_type STRING NOT NULL
    CHECK(encumbrance_type IN ('mortgage','lien','dispute','other')), claimant_name STRING NOT NULL,
  start_date DATE NOT NULL, end_date DATE, status STRING NOT NULL CHECK(status IN ('active','released')),
  details STRING NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK(end_date IS NULL OR end_date >= start_date)
);
CREATE TABLE IF NOT EXISTS mutations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), property_id UUID NOT NULL REFERENCES properties(id),
  transaction_id UUID REFERENCES transactions(id), mutation_date DATE NOT NULL,
  mutation_type STRING NOT NULL CHECK(mutation_type IN ('ownership_change','boundary_update','correction')),
  description STRING NOT NULL, status STRING NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  approving_officer_id UUID REFERENCES officers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK(status != 'approved' OR approving_officer_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS ownerships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), property_id UUID NOT NULL REFERENCES properties(id),
  owner_id UUID NOT NULL REFERENCES owners(id), share DECIMAL(9,8) NOT NULL CHECK(share > 0 AND share <= 1),
  valid_from DATE NOT NULL, valid_to DATE, source_transaction_id UUID NOT NULL REFERENCES transactions(id),
  end_transaction_id UUID REFERENCES transactions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK(valid_to IS NULL OR valid_to >= valid_from),
  CHECK((valid_to IS NULL AND end_transaction_id IS NULL) OR (valid_to IS NOT NULL AND end_transaction_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS ownerships_current_owner ON ownerships(property_id,owner_id) WHERE valid_to IS NULL;
CREATE TABLE IF NOT EXISTS transaction_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), transaction_id UUID NOT NULL REFERENCES transactions(id),
  owner_id UUID NOT NULL REFERENCES owners(id), role STRING NOT NULL CHECK(role IN ('transferor','transferee')),
  share DECIMAL(9,8) NOT NULL CHECK(share > 0 AND share <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(transaction_id,owner_id,role)
);
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), username STRING NOT NULL UNIQUE, password_hash STRING NOT NULL,
  role STRING NOT NULL CONSTRAINT users_role_allowed CHECK(role IN ('administrator','owner','survey_officer','valuation_officer','sub_registrar','bank_verifier','auditor','public_viewer')),
  owner_id UUID REFERENCES owners(id), officer_id UUID REFERENCES officers(id), active BOOL NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_role_profile CHECK((role = 'owner' AND owner_id IS NOT NULL AND officer_id IS NULL)
    OR (role IN ('survey_officer','valuation_officer','sub_registrar','auditor') AND officer_id IS NOT NULL AND owner_id IS NULL)
    OR (role = 'bank_verifier' AND owner_id IS NULL)
    OR (role IN ('administrator','public_viewer') AND owner_id IS NULL AND officer_id IS NULL))
);
CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), actor_id UUID NOT NULL REFERENCES users(id), action STRING NOT NULL,
  entity_type STRING NOT NULL, entity_id UUID NOT NULL, occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(), summary JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), applicant_owner_id UUID NOT NULL REFERENCES owners(id),
  property_id UUID NOT NULL REFERENCES properties(id), service_type STRING NOT NULL
    CHECK(service_type IN ('registration','transfer','mutation','encumbrance_certificate')),
  status STRING NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','under_review','approved','rejected')),
  submitted_date DATE NOT NULL, transaction_id UUID REFERENCES transactions(id), reviewing_officer_id UUID REFERENCES officers(id),
  notes STRING, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), certificate_no STRING NOT NULL UNIQUE,
  property_id UUID NOT NULL REFERENCES properties(id), period_from DATE NOT NULL, period_to DATE NOT NULL,
  issue_date DATE NOT NULL, issuing_officer_id UUID NOT NULL REFERENCES officers(id),
  application_id UUID REFERENCES applications(id), snapshot_summary JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(period_to >= period_from)
);
CREATE INDEX IF NOT EXISTS properties_district ON properties(district_id);
CREATE INDEX IF NOT EXISTS transactions_property ON transactions(property_id,transaction_date);
CREATE INDEX IF NOT EXISTS documents_property ON documents(property_id);
CREATE INDEX IF NOT EXISTS ownerships_history ON ownerships(property_id,valid_from);
CREATE INDEX IF NOT EXISTS parties_transaction ON transaction_parties(transaction_id);
CREATE INDEX IF NOT EXISTS surveys_property ON surveys(property_id,survey_date);
CREATE INDEX IF NOT EXISTS valuations_property ON valuations(property_id,valuation_date);
CREATE INDEX IF NOT EXISTS payments_property ON tax_payments(property_id,tax_year);
CREATE INDEX IF NOT EXISTS encumbrances_property ON encumbrances(property_id,status);
CREATE INDEX IF NOT EXISTS mutations_property ON mutations(property_id);
CREATE INDEX IF NOT EXISTS applications_owner ON applications(applicant_owner_id);
CREATE INDEX IF NOT EXISTS audit_entity ON audit_events(entity_type,entity_id,occurred_at);
