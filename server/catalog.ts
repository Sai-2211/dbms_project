import { pool } from "./db.js";
import { resources } from "./resources.js";
import type { DatabaseSchema, SchemaRelation } from "../shared/schema.js";

// Identifiers below come exclusively from server-owned metadata, never request input.
export async function readSchema(): Promise<DatabaseSchema> {
  const names = [...resources.map((r) => r.key), "users"];
  const [columns, keys, foreignKeys, info] = await Promise.all([
    pool.query(
      "SELECT table_name,column_name,crdb_sql_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1) AND is_hidden='NO' ORDER BY table_name,ordinal_position",
      [names],
    ),
    pool.query(
      "SELECT t.table_name,t.constraint_name,t.constraint_type,k.column_name,k.ordinal_position FROM information_schema.table_constraints t JOIN information_schema.key_column_usage k ON k.constraint_catalog=t.constraint_catalog AND k.constraint_schema=t.constraint_schema AND k.constraint_name=t.constraint_name AND k.table_name=t.table_name WHERE t.table_schema='public' AND t.table_name=ANY($1) ORDER BY t.table_name,t.constraint_name,k.ordinal_position",
      [names],
    ),
    pool.query(
      "SELECT f.constraint_name,f.table_name,k.column_name,f.referenced_table_name,u.column_name AS referenced_column,c.is_nullable,f.delete_rule,k.ordinal_position FROM information_schema.referential_constraints f JOIN information_schema.key_column_usage k ON k.constraint_catalog=f.constraint_catalog AND k.constraint_schema=f.constraint_schema AND k.constraint_name=f.constraint_name AND k.table_name=f.table_name JOIN information_schema.key_column_usage u ON u.constraint_catalog=f.unique_constraint_catalog AND u.constraint_schema=f.unique_constraint_schema AND u.constraint_name=f.unique_constraint_name AND u.table_name=f.referenced_table_name AND u.ordinal_position=k.position_in_unique_constraint JOIN information_schema.columns c ON c.table_catalog=k.table_catalog AND c.table_schema=k.table_schema AND c.table_name=k.table_name AND c.column_name=k.column_name WHERE f.constraint_schema='public' AND f.table_name=ANY($1) ORDER BY f.table_name,f.constraint_name,k.ordinal_position",
      [names],
    ),
    pool.query("SELECT current_database() AS database,version() AS engine"),
  ]);
  const tables = await Promise.all(
    names.map(async (name) => {
      const [constraints, ddl] = await Promise.all([
        pool.query(`SHOW CONSTRAINTS FROM ${name}`),
        pool.query(`SHOW CREATE TABLE ${name}`),
      ]);
      return {
        name,
        columns: columns.rows
          .filter((c) => c.table_name === name)
          .map((c) => ({
            name: c.column_name,
            type: c.crdb_sql_type,
            nullable: c.is_nullable === "YES",
            default: c.column_default,
            primary: keys.rows.some(
              (k) =>
                k.table_name === name &&
                k.column_name === c.column_name &&
                k.constraint_type === "PRIMARY KEY",
            ),
            foreign: keys.rows.some(
              (k) =>
                k.table_name === name &&
                k.column_name === c.column_name &&
                k.constraint_type === "FOREIGN KEY",
            ),
          })),
        constraints: constraints.rows.map((c) => ({
          name: c.constraint_name,
          type: c.constraint_type,
          details: c.details,
          validated: c.validated,
        })),
        ddl: ddl.rows[0].create_statement,
      };
    }),
  );
  const relations: SchemaRelation[] = [];
  for (const f of foreignKeys.rows) {
    let relation = relations.find(
      (r) => r.source === f.table_name && r.name === f.constraint_name,
    );
    if (!relation) {
      relation = {
        name: f.constraint_name,
        source: f.table_name,
        sourceColumns: [],
        target: f.referenced_table_name,
        targetColumns: [],
        optional: false,
        childMaximum: "N",
        deleteRule: f.delete_rule,
      };
      relations.push(relation);
    }
    relation.sourceColumns.push(f.column_name);
    relation.targetColumns.push(f.referenced_column);
    relation.optional ||= f.is_nullable === "YES";
  }
  for (const relation of relations) {
    const uniqueGroups = new Map<string, string[]>();
    for (const k of keys.rows.filter(
      (k) =>
        k.table_name === relation.source &&
        ["PRIMARY KEY", "UNIQUE"].includes(k.constraint_type),
    )) {
      uniqueGroups.set(k.constraint_name, [
        ...(uniqueGroups.get(k.constraint_name) || []),
        k.column_name,
      ]);
    }
    // Only unconditional unique constraints bound the child count. A partial index does not.
    if (
      [...uniqueGroups.values()].some((group) =>
        group.every((c) => relation.sourceColumns.includes(c)),
      )
    )
      relation.childMaximum = "1";
  }
  return {
    ...info.rows[0],
    generatedAt: new Date().toISOString(),
    tables,
    relations,
  };
}
