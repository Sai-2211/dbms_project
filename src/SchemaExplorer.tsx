import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  type Node,
  type NodeProps,
  type Edge,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  Database,
  Focus,
  Network,
  RotateCcw,
  Download,
  RefreshCw,
} from "lucide-react";
import "@xyflow/react/dist/style.css";
import { api } from "./api";
import Drawer from "./Drawer";
import type { DatabaseSchema, SchemaTable } from "../shared/schema";

type TableNode = Node<
  { table: SchemaTable; dimmed: boolean; inspect: (name: string) => void },
  "table"
>;
const order = [
  "districts",
  "offices",
  "officers",
  "users",
  "audit_events",
  "owners",
  "properties",
  "transactions",
  "transaction_parties",
  "ownerships",
  "surveys",
  "valuations",
  "documents",
  "applications",
  "mutations",
  "tax_payments",
  "encumbrances",
  "certificates",
];
const title = (name: string) =>
  name.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
function EntityNode({ data, selected }: NodeProps<TableNode>) {
  const keys = data.table.columns.filter((c) => c.primary || c.foreign);
  return (
    <div
      className={`schema-node ${selected ? "selected" : ""} ${data.dimmed ? "dimmed" : ""}`}
    >
      <header>
        <Database size={15} />
        <strong>{title(data.table.name)}</strong>
        <span>{data.table.columns.length}</span>
      </header>
      {keys.map((c) => (
        <div className="schema-node-column" key={c.name}>
          {c.foreign && (
            <Handle
              type="source"
              position={Position.Left}
              id={c.name}
              isConnectable={false}
            />
          )}
          <b className={c.primary ? "key-primary" : "key-foreign"}>
            {c.primary ? "PK" : "FK"}
          </b>
          <code>{c.name}</code>
          <span title={c.nullable ? "Nullable reference" : "Required"}>
            {c.nullable ? "?" : "•"}
          </span>
          {c.primary && (
            <Handle
              type="target"
              position={Position.Right}
              id={c.name}
              isConnectable={false}
            />
          )}
        </div>
      ))}
      <footer>
        <button
          type="button"
          className="schema-inspect-button nodrag nopan"
          aria-label={`Inspect ${title(data.table.name)} attributes`}
          onClick={(event) => {
            event.stopPropagation();
            data.inspect(data.table.name);
          }}
        >
          Inspect attributes ({data.table.columns.length})
        </button>
      </footer>
    </div>
  );
}
const nodeTypes = { table: EntityNode };
export default function SchemaExplorer() {
  const [schema, setSchema] = useState<DatabaseSchema | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState("properties");
  const [inspection, setInspection] = useState<string[]>([]);
  const inspectTable = useCallback((name: string) => {
    setSelected(name);
    setInspection([name]);
  }, []);
  const [nearby, setNearby] = useState(false);
  const [flow, setFlow] = useState<ReactFlowInstance<TableNode> | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<TableNode>([]);
  useEffect(() => {
    let alive = true;
    setError("");
    api<DatabaseSchema>("/schema")
      .then((result) => {
        if (alive) setSchema(result);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [revision]);
  useEffect(() => {
    if (!schema) return;
    setNodes(
      order
        .filter((name) => schema.tables.some((t) => t.name === name))
        .map((name, i) => ({
          id: name,
          type: "table",
          position: { x: (i % 5) * 350, y: Math.floor(i / 5) * 340 },
          data: {
            table: schema.tables.find((t) => t.name === name)!,
            dimmed: false,
            inspect: inspectTable,
          },
          selected: name === selected,
        })),
    );
  }, [schema, setNodes, inspectTable]);
  const connected = useMemo(
    () =>
      new Set([
        selected,
        ...(schema?.relations
          .filter((r) => r.source === selected || r.target === selected)
          .flatMap((r) => [r.source, r.target]) || []),
      ]),
    [schema, selected],
  );
  const visibleNodes = nodes.map((n) => ({
    ...n,
    selected: n.id === selected,
    hidden: nearby && !connected.has(n.id),
    data: { ...n.data, dimmed: !connected.has(n.id) },
  }));
  const edges: Edge[] = (schema?.relations || []).map((r) => {
    const active = r.source === selected || r.target === selected;
    return {
      id: `${r.source}-${r.name}`,
      source: r.source,
      target: r.target,
      sourceHandle: r.sourceColumns[0],
      targetHandle: r.targetColumns[0],
      type: "smoothstep",
      hidden: nearby && !active,
      label: active
        ? `${r.sourceColumns.join(", ")} · 0..${r.childMaximum} → ${r.optional ? "0..1" : "1"}`
        : undefined,
      style: {
        stroke: active ? "#204e43" : "#b4c6be",
        strokeWidth: active ? 2 : 1,
        opacity: active ? 1 : 0.4,
      },
      labelStyle: { fontSize: 10, fill: "#204e43" },
      labelBgStyle: { fill: "#f9faf6", fillOpacity: 0.95 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: active ? "#204e43" : "#b4c6be",
      },
      zIndex: active ? 2 : 0,
      reconnectable: false,
      deletable: false,
    };
  });
  const table = schema?.tables.find((t) => t.name === selected);
  const relations =
    schema?.relations.filter(
      (r) => r.source === selected || r.target === selected,
    ) || [];
  function focusTable(name: string) {
    setSelected(name);
    setInspection((previous) =>
      previous.length ? [...previous, name] : [name],
    );
    void flow?.fitView({
      nodes: [{ id: name }],
      padding: 0.8,
      maxZoom: 1.15,
      duration: 350,
    });
  }
  function exportSchema() {
    if (!schema) return;
    const blob = new Blob([JSON.stringify(schema, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = "landledger-live-schema.json";
    link.click();
    URL.revokeObjectURL(url);
  }
  if (error)
    return (
      <div className="error-panel" role="alert">
        <p>{error}</p>
        <button
          className="button secondary"
          onClick={() => setRevision((v) => v + 1)}
        >
          Try again
        </button>
      </div>
    );
  if (!schema)
    return <div className="loading">Reading database definitions…</div>;
  return (
    <section className="schema-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">DATABASE BLUEPRINT</span>
          <h1>ER diagram</h1>
          <p>Explore the relationships that keep land records connected.</p>
        </div>
        <div className="schema-summary">
          <Database size={18} />
          <span>
            {schema.tables.length} tables · {schema.relations.length}{" "}
            relationships
          </span>
        </div>
      </div>
      <div className="schema-toolbar">
        <label>
          Explore table
          <select
            aria-label="Explore table"
            value={selected}
            onChange={(e) => focusTable(e.target.value)}
          >
            {schema.tables.map((t) => (
              <option key={t.name} value={t.name}>
                {title(t.name)}
              </option>
            ))}
          </select>
        </label>
        <label className="schema-checkbox">
          <input
            type="checkbox"
            checked={nearby}
            onChange={(e) => setNearby(e.target.checked)}
          />{" "}
          Related tables only
        </label>
        <button
          className="button secondary small"
          onClick={() => void flow?.fitView({ padding: 0.12, duration: 350 })}
        >
          <Focus size={15} />
          Fit diagram
        </button>
        <button
          className="button secondary small"
          onClick={() => {
            setSchema({ ...schema });
          }}
        >
          <RotateCcw size={15} />
          Reset layout
        </button>
        <button
          className="button secondary small"
          onClick={() => setRevision((v) => v + 1)}
          title="Re-read CockroachDB definitions"
        >
          <RefreshCw size={15} />
          Refresh
        </button>
        <button className="button secondary small" onClick={exportSchema}>
          <Download size={15} />
          Export schema
        </button>
      </div>
      <div className="schema-workspace">
        <div
          className="schema-canvas"
          aria-label="Interactive database relationship diagram"
        >
          <ReactFlow<TableNode>
            nodes={visibleNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeClick={(_event, node) => inspectTable(node.id)}
            onInit={setFlow}
            fitView
            fitViewOptions={{ padding: 0.12 }}
            minZoom={0.15}
            maxZoom={1.8}
            nodesConnectable={false}
            edgesReconnectable={false}
            deleteKeyCode={null}
            panOnScroll
          >
            <Background gap={22} color="#d9e2da" />
            <Controls showInteractive={false} />
            <MiniMap
              nodeColor={(n) => (n.id === selected ? "#204e43" : "#b6caba")}
              pannable
              zoomable
            />
          </ReactFlow>
          <div className="schema-hint">
            Drag tables to arrange · pan or zoom to explore
          </div>
        </div>
        <aside className="schema-inspector" aria-label="Selected table details">
          {table && (
            <>
              <span className="eyebrow">ENTITY DETAILS</span>
              <h2>{title(table.name)}</h2>
              <code className="schema-table-name">public.{table.name}</code>
              <h3>
                Attributes <span>{table.columns.length}</span>
              </h3>
              <div className="schema-attributes">
                {table.columns.map((c) => (
                  <div key={c.name}>
                    <div>
                      <b className={c.primary ? "key-primary" : "key-foreign"}>
                        {c.primary ? "PK" : c.foreign ? "FK" : "·"}
                      </b>
                      <code>{c.name}</code>
                    </div>
                    <small>
                      {c.type} · {c.nullable ? "nullable" : "required"}
                    </small>
                    {c.default && (
                      <small title={c.default}>Default: {c.default}</small>
                    )}
                  </div>
                ))}
              </div>
              <h3>
                Relationships <span>{relations.length}</span>
              </h3>
              {relations.map((r) => (
                <button
                  className="schema-relationship"
                  key={`${r.source}-${r.name}`}
                  onClick={() =>
                    focusTable(r.source === selected ? r.target : r.source)
                  }
                >
                  <Network size={15} />
                  <span>
                    <strong>
                      {r.source}.{r.sourceColumns.join(",")}
                    </strong>
                    <small>
                      → {r.target}.{r.targetColumns.join(",")}
                      <br />
                      Each child: {r.optional ? "0..1" : "1"} parent · each
                      parent: 0..{r.childMaximum} children
                      <br />
                      Delete: {r.deleteRule}
                    </small>
                  </span>
                </button>
              ))}
              <details>
                <summary>
                  Database constraints ({table.constraints.length})
                </summary>
                {table.constraints.map((c) => (
                  <div className="schema-constraint" key={c.name}>
                    <b>{c.type}</b>
                    <code>{c.details}</code>
                    <small>
                      {c.validated
                        ? "Validated by database"
                        : "Not yet validated"}
                    </small>
                  </div>
                ))}
              </details>
              <details>
                <summary>Table SQL & indexes</summary>
                <pre>{table.ddl}</pre>
              </details>
            </>
          )}
        </aside>
        {inspection.length > 0 && (
          <Drawer
            title={`${title(selected)} attributes`}
            subtitle="Live database columns, keys and constraints"
            onClose={() => setInspection([])}
            onBack={
              inspection.length > 1
                ? () => {
                    const next = inspection.slice(0, -1);
                    setSelected(next[next.length - 1]);
                    setInspection(next);
                  }
                : undefined
            }
            backLabel={
              inspection.length > 1
                ? `Back to ${title(inspection[inspection.length - 2])}`
                : undefined
            }
          >
            <div className="drawer-body schema-inspection-details">
              {" "}
              {table && (
                <>
                  <span className="eyebrow">ENTITY DETAILS</span>
                  <h2>{title(table.name)}</h2>
                  <code className="schema-table-name">public.{table.name}</code>
                  <h3>
                    Attributes <span>{table.columns.length}</span>
                  </h3>
                  <div className="schema-attributes">
                    {table.columns.map((c) => (
                      <div key={c.name}>
                        <div>
                          <b
                            className={
                              c.primary ? "key-primary" : "key-foreign"
                            }
                          >
                            {c.primary ? "PK" : c.foreign ? "FK" : "·"}
                          </b>
                          <code>{c.name}</code>
                        </div>
                        <small>
                          {c.type} · {c.nullable ? "nullable" : "required"}
                        </small>
                        {c.default && (
                          <small title={c.default}>Default: {c.default}</small>
                        )}
                      </div>
                    ))}
                  </div>
                  <h3>
                    Relationships <span>{relations.length}</span>
                  </h3>
                  {relations.map((r) => (
                    <button
                      className="schema-relationship"
                      key={`${r.source}-${r.name}`}
                      onClick={() =>
                        focusTable(r.source === selected ? r.target : r.source)
                      }
                    >
                      <Network size={15} />
                      <span>
                        <strong>
                          {r.source}.{r.sourceColumns.join(",")}
                        </strong>
                        <small>
                          → {r.target}.{r.targetColumns.join(",")}
                          <br />
                          Each child: {r.optional ? "0..1" : "1"} parent · each
                          parent: 0..{r.childMaximum} children
                          <br />
                          Delete: {r.deleteRule}
                        </small>
                      </span>
                    </button>
                  ))}
                  <details>
                    <summary>
                      Database constraints ({table.constraints.length})
                    </summary>
                    {table.constraints.map((c) => (
                      <div className="schema-constraint" key={c.name}>
                        <b>{c.type}</b>
                        <code>{c.details}</code>
                        <small>
                          {c.validated
                            ? "Validated by database"
                            : "Not yet validated"}
                        </small>
                      </div>
                    ))}
                  </details>
                  <details>
                    <summary>Table SQL & indexes</summary>
                    <pre>{table.ddl}</pre>
                  </details>
                </>
              )}
            </div>
          </Drawer>
        )}
      </div>
      <div className="schema-legend">
        <span>
          <b className="key-primary">PK</b> Primary key
        </span>
        <span>
          <b className="key-foreign">FK</b> Foreign key
        </span>
        <span>• Required reference</span>
        <span>? Nullable reference</span>
        <span>Arrows point from child to referenced parent.</span>
      </div>
      <p className="schema-note">
        Source: live CockroachDB catalog · {schema.database} · refreshed{" "}
        {new Date(schema.generatedAt).toLocaleTimeString()}. Cardinalities
        describe stored foreign keys. A parent can have no child records;
        nullable references allow no parent. The ownership total of 100% is
        enforced during approval, and active ownership uniqueness uses a partial
        index shown in the table SQL. Property types and officer roles are
        attributes; this schema has no inheritance hierarchy.
      </p>
    </section>
  );
}
