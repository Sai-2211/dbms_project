import type { Resource } from "../server/resources";

export function updateRecordField(
  resource: Pick<Resource, "key" | "fields">,
  current: Record<string, any>,
  key: string,
  value: any,
  properties: { id: string; office_id?: string }[] = [],
) {
  const next = { ...current, [key]: value };
  const hasEditableField = (name: string) =>
    resource.fields.some((field) => field.key === name && !field.readOnly);

  if (key === "district_id" && hasEditableField("office_id"))
    next.office_id = "";
  if (key === "property_id") {
    for (const dependent of ["transaction_id", "document_id", "application_id"])
      if (hasEditableField(dependent)) next[dependent] = "";
    if (resource.key === "transactions" && hasEditableField("office_id"))
      next.office_id =
        properties.find((property) => property.id === value)?.office_id || "";
  }
  return next;
}
