export type SchemaColumn = {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  primary: boolean;
  foreign: boolean;
};
export type SchemaConstraint = {
  name: string;
  type: string;
  details: string;
  validated: boolean;
};
export type SchemaTable = {
  name: string;
  columns: SchemaColumn[];
  constraints: SchemaConstraint[];
  ddl: string;
};
export type SchemaRelation = {
  name: string;
  source: string;
  sourceColumns: string[];
  target: string;
  targetColumns: string[];
  optional: boolean;
  childMaximum: "1" | "N";
  deleteRule: string;
};
export type DatabaseSchema = {
  database: string;
  engine: string;
  generatedAt: string;
  tables: SchemaTable[];
  relations: SchemaRelation[];
};
