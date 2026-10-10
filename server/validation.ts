import { Decimal } from "decimal.js";
import { demand } from "./errors.js";
import type { Resource } from "./resources.js";
export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function validateRecord(
  resource: Resource,
  input: unknown,
  partial = false,
): Record<string, unknown> {
  demand(
    input && typeof input === "object" && !Array.isArray(input),
    "Provide a record object.",
  );
  const data = input as Record<string, unknown>;
  const allowed = resource.fields.filter((f) => !f.readOnly);
  demand(
    Object.keys(data).every((k) => allowed.some((f) => f.key === k)),
    "The request contains unsupported or protected fields.",
  );
  const clean: Record<string, unknown> = {};
  for (const f of allowed) {
    if (partial && !(f.key in data)) continue;
    let value = data[f.key];
    if (typeof value === "string") value = value.trim();
    if (value === undefined || value === null || value === "") {
      demand(!f.required, `${f.label} is required.`);
      clean[f.key] = null;
      continue;
    }
    if (f.type === "boolean") {
      demand(typeof value === "boolean", `${f.label} must be true or false.`);
    } else if (f.type === "number") {
      demand(
        ["string", "number"].includes(typeof value) &&
          /^\d+(\.\d+)?$/.test(String(value)),
        `${f.label} must be a decimal number.`,
      );
      const number = new Decimal(String(value));
      demand(
        number.decimalPlaces() <= (f.scale ?? 2),
        `${f.label} allows up to ${f.scale ?? 2} decimal places.`,
      );
      demand(
        number.greaterThanOrEqualTo(f.min ?? 0),
        `${f.label} must be at least ${f.min ?? 0}.`,
      );
      demand(
        number.lessThan(new Decimal(10).pow(14)),
        `${f.label} is too large.`,
      );
      if (f.key === "share")
        demand(
          number.lessThanOrEqualTo(1),
          "An ownership share cannot exceed 1.",
        );
      if (f.key === "tax_year")
        demand(
          number.lessThanOrEqualTo(2200),
          "Tax year must be between 1900 and 2200.",
        );
      value = number.toString();
    } else {
      demand(typeof value === "string", `${f.label} must be text.`);
      demand(
        value.length <= (f.type === "textarea" ? 5000 : 500),
        `${f.label} is too long.`,
      );
      if (f.type === "reference")
        demand(
          uuidPattern.test(value),
          `${f.label} must reference a valid record.`,
        );
      if (f.type === "date")
        demand(validDate(value), `${f.label} must be a valid date.`);
      if (f.type === "email")
        demand(
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
          "Enter a valid email address.",
        );
      if (f.type === "select")
        demand(
          f.options?.includes(value),
          `Select a valid ${f.label.toLowerCase()}.`,
        );
    }
    clean[f.key] = value;
  }
  return clean;
}
