import {
  useCallback,
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  FileCheck2,
  FileText,
  Fingerprint,
  History,
  Home,
  Landmark,
  Layers3,
  Leaf,
  Loader2,
  LockKeyhole,
  LogOut,
  MapPin,
  MapPinned,
  Plus,
  Search,
  ShieldCheck,
  Sprout,
  Upload,
  UserRound,
  UsersRound,
  Wallet,
  X,
  AlertCircle,
  RefreshCw,
  Settings2,
  Ruler,
  Scale,
  BriefcaseBusiness,
  PanelRightClose,
  Network,
  type LucideIcon,
} from "lucide-react";
import type { Actor, Field, Resource } from "../server/resources";
import { api, ApiError } from "./api";
import { csvCell } from "./csv";
const SchemaExplorer = lazy(() => import("./SchemaExplorer"));

type Meta = Resource & { canWrite: boolean };
type Row = Record<string, any>;
type Lookup = {
  id: string;
  label: string;
  designation?: string;
  active?: boolean;
  district_id?: string;
  office_id?: string;
  property_id?: string;
  transaction_type?: string;
  service_type?: string;
  status?: string;
};
type Lookups = Record<string, Lookup[]>;
type RecordPage = { rows: Row[]; total: number; page: number; limit: number };
type Dashboard = {
  properties: string;
  registered: string;
  owners: string;
  pending: string;
  tax: string;
  types: { label: string; count: string }[];
  districts: { label: string; count: string }[];
  recent: Row[];
  activity: Row[];
};
const icons: Record<string, LucideIcon> = {
  properties: Layers3,
  owners: UsersRound,
  districts: MapPinned,
  offices: Building2,
  officers: UserRound,
  transactions: ArrowRight,
  documents: FileText,
  surveys: Ruler,
  valuations: Scale,
  tax_payments: Wallet,
  encumbrances: ShieldCheck,
  mutations: History,
  applications: ClipboardList,
  certificates: FileCheck2,
  ownerships: Fingerprint,
  audit_events: History,
  transaction_parties: UsersRound,
};
const coreTabs = [
  "properties",
  "owners",
  "districts",
  "offices",
  "officers",
  "transactions",
  "documents",
  "surveys",
  "valuations",
  "tax_payments",
  "encumbrances",
  "mutations",
];
const colors: Record<string, string> = {
  residential: "#204e43",
  commercial: "#719078",
  agricultural: "#c1d39b",
  industrial: "#dfd4b9",
};
const nice = (s: unknown) =>
  String(s ?? "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
const money = (v: unknown) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(v || 0));
const compact = (v: unknown) =>
  new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(v || 0));
const date = (v: unknown) =>
  v
    ? new Date(String(v)).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
const statusKey = (r: Meta) =>
  r.fields.find((f) =>
    [
      "registration_status",
      "verification_status",
      "survey_status",
      "payment_status",
      "status",
    ].includes(f.key),
  )?.key;

function useLoad<T>(url: string | null, revision = 0) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(null);
    if (!url) {
      setLoading(false);
      return;
    }
    api<T>(url)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [url, revision]);
  return { data, loading, error };
}
function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const Component = icons[name] || Layers3;
  return <Component size={size} />;
}
function Badge({ value }: { value: unknown }) {
  return (
    <span className={`badge badge-${String(value)}`}>
      <span />
      {nice(value) || "—"}
    </span>
  );
}
function Loading() {
  return (
    <div className="loading">
      <Loader2 className="spin" size={24} />
      <span>Loading registry records…</span>
    </div>
  );
}
function ErrorPanel({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="error-panel" role="alert">
      <AlertCircle size={22} />
      <div>
        <strong>Unable to load records</strong>
        <p>{message}</p>
      </div>
      {onRetry && (
        <button className="button secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
function Empty({
  title = "No records yet",
  description = "Add your first record to get started.",
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Layers3 size={34} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export default function App() {
  const [actor, setActor] = useState<Actor | null>(null);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState("");
  useEffect(() => {
    api<Actor>("/auth/me")
      .then(setActor)
      .catch((e) => {
        if (e.status !== 401) setBootError(e.message);
      })
      .finally(() => setBooting(false));
  }, []);
  if (booting)
    return (
      <div className="boot">
        <Brand />
        <Loading />
      </div>
    );
  return actor ? (
    <Workspace actor={actor} onLogout={() => setActor(null)} />
  ) : (
    <Login onLogin={setActor} initialError={bootError} />
  );
}
function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark">
        <Layers3 size={24} />
      </div>
      <div>
        <strong>
          LandLedger<span>®</span>
        </strong>
        <small>LAND REGISTRATION & PROPERTY MANAGEMENT</small>
      </div>
    </div>
  );
}
function Login({
  onLogin,
  initialError,
}: {
  onLogin: (a: Actor) => void;
  initialError: string;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLogin(
        await api<Actor>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ username, password }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <section className="login-story">
        <Brand />
        <div className="login-copy">
          <span className="eyebrow light">A SINGLE SOURCE OF RECORD</span>
          <h1>
            Every parcel.
            <br />
            Every owner.
            <br />
            <em>One clear history.</em>
          </h1>
          <p>
            A connected workspace for land registration, verified transfers, and
            transparent property records.
          </p>
          <ParcelArt />
        </div>
        <div className="login-footer">
          <ShieldCheck size={18} />
          Built on consistent, transactional records.
        </div>
      </section>
      <section className="login-panel">
        <div className="login-form">
          <span className="eyebrow">REGISTRY WORKSPACE</span>
          <h2>Welcome back.</h2>
          <p>Sign in to manage and explore your land records.</p>
          <form onSubmit={submit}>
            <label>
              Username
              <input
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Your registry username"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary full" disabled={busy}>
              {busy ? (
                <Loader2 className="spin" size={18} />
              ) : (
                <LockKeyhole size={18} />
              )}{" "}
              {busy ? "Signing in…" : "Sign in to workspace"}
              <ArrowRight size={18} />
            </button>
          </form>
          {import.meta.env.DEV && (
            <div className="demo-hint">
              <strong>Local demonstration</strong>
              <p>
                After seeding the database, use{" "}
                <code>admin@landledger.local</code> and{" "}
                <code>LandLedger@2026</code>.
              </p>
              <button
                onClick={() => {
                  setUsername("admin@landledger.local");
                  setPassword("LandLedger@2026");
                }}
              >
                Fill demo credentials <ArrowRight size={14} />
              </button>
            </div>
          )}
          <div className="login-note">
            <ShieldCheck size={17} />
            Your access is governed by your registry role.
          </div>
        </div>
      </section>
    </div>
  );
}
function ParcelArt() {
  return (
    <svg className="parcel-art" viewBox="0 0 460 220" aria-hidden="true">
      <defs>
        <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path
            d="M24 0H0V24"
            fill="none"
            stroke="currentColor"
            strokeWidth=".4"
            opacity=".15"
          />
        </pattern>
      </defs>
      <rect width="460" height="220" fill="url(#grid)" />
      <g stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round">
        <path
          d="M20 125L102 69 166 88 149 144 76 164Z"
          fill="currentColor"
          fillOpacity=".06"
        />
        <path
          d="M102 69L180 26 229 57 166 88Z"
          fill="currentColor"
          fillOpacity=".13"
        />
        <path
          d="M166 88L229 57 283 89 248 151 149 144Z"
          fill="currentColor"
          fillOpacity=".22"
        />
        <path
          d="M76 164L149 144 248 151 206 210 120 199Z"
          fill="currentColor"
          fillOpacity=".1"
        />
        <path
          d="M229 57L304 26 389 58 340 111 283 89Z"
          fill="currentColor"
          fillOpacity=".06"
        />
        <path
          d="M283 89L340 111 407 145 335 195 248 151Z"
          fill="currentColor"
          fillOpacity=".13"
        />
        <path
          d="M340 111L389 58 441 91 407 145Z"
          fill="currentColor"
          fillOpacity=".06"
        />
      </g>
      <circle cx="218" cy="113" r="19" fill="#d7e9ad" />
      <path
        d="M218 102a7 7 0 0 0-7 7c0 6 7 13 7 13s7-7 7-13a7 7 0 0 0-7-7Z"
        fill="none"
        stroke="#163c35"
        strokeWidth="2"
      />
      <circle cx="218" cy="109" r="2" fill="#163c35" />
    </svg>
  );
}

function Workspace({
  actor,
  onLogout,
}: {
  actor: Actor;
  onLogout: () => void;
}) {
  const [route, setRoute] = useState(location.hash.slice(1) || "home");
  const [revision, setRevision] = useState(0);
  const [lookups, setLookups] = useState<Lookups>({});
  const [drawer, setDrawer] = useState<{
    resource: string;
    row?: Row;
    create?: boolean;
    defaults?: Row;
  } | null>(null);
  const [utility, setUtility] = useState(false);
  const [accounts, setAccounts] = useState(false);
  const [help, setHelp] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [health, setHealth] = useState("checking");
  const meta = useLoad<Meta[]>("/metadata", revision);
  const resources = meta.data || [];
  useEffect(() => {
    const listener = () => setRoute(location.hash.slice(1) || "home");
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  useEffect(() => {
    let alive = true;
    const check = () =>
      api<{ status: string }>("/health")
        .then((r) => {
          if (alive) setHealth(r.status);
        })
        .catch(() => {
          if (alive) setHealth("disconnected");
        });
    void check();
    const timer = setInterval(check, 30000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    let alive = true;
    if (!meta.data) return;
    Promise.all(
      meta.data
        .filter((r) => r.key !== "audit_events")
        .map(async (r) => {
          try {
            return [r.key, await api<Lookup[]>(`/lookups/${r.key}`)] as const;
          } catch {
            return [r.key, []] as const;
          }
        }),
    ).then((entries) => {
      if (alive) setLookups(Object.fromEntries(entries));
    });
    return () => {
      alive = false;
    };
  }, [meta.data]);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
  function notify(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 5000);
  }
  function navigate(key: string) {
    location.hash = key;
    setUtility(false);
  }
  function changed(message = "Record saved successfully.") {
    setRevision((v) => v + 1);
    notify(message);
  }
  const current = resources.find((r) => r.key === route);
  const openCreate = (key: string, defaults?: Row) =>
    setDrawer({ resource: key, create: true, defaults });
  return (
    <div className="app-shell">
      <header className="header">
        <div className="header-inner">
          <button
            className="brand-button"
            onClick={() => navigate("home")}
            aria-label="Go to dashboard"
          >
            <Brand />
          </button>
          <div className="header-actions">
            <span className={`connection ${health}`}>
              <i />
              {health === "connected"
                ? "Database connected"
                : health === "checking"
                  ? "Checking connection"
                  : "Database offline"}
            </span>
            <span className="header-divider" />
            <button
              className="account-button"
              onClick={() => setUtility((v) => !v)}
            >
              <span className="avatar">
                {actor.username.slice(0, 2).toUpperCase()}
              </span>
              <span>
                <strong>{actor.username.split("@")[0]}</strong>
                <small>{nice(actor.role)}</small>
              </span>
              <ChevronDown size={15} />
            </button>
            {utility && (
              <div className="utility-menu">
                <strong>Workspace tools</strong>
                {resources
                  .filter((r) =>
                    [
                      "applications",
                      "certificates",
                      "ownerships",
                      "audit_events",
                    ].includes(r.key),
                  )
                  .map((r) => (
                    <button key={r.key} onClick={() => navigate(r.key)}>
                      <Icon name={r.key} />
                      {r.title}
                    </button>
                  ))}
                {actor.role === "administrator" && (
                  <button
                    onClick={() => {
                      setAccounts(true);
                      setUtility(false);
                    }}
                  >
                    <UsersRound size={18} />
                    User accounts
                  </button>
                )}
                <button
                  onClick={() => {
                    setHelp(true);
                    setUtility(false);
                  }}
                >
                  <CircleHelp size={18} />
                  Project guide
                </button>
                <button
                  onClick={async () => {
                    try {
                      await api("/auth/logout", { method: "POST" });
                      onLogout();
                    } catch (e) {
                      notify((e as Error).message);
                    }
                  }}
                >
                  <LogOut size={18} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <div className="nav-wrap">
        <nav className="main-nav" aria-label="Primary records">
          <button
            className={`home-nav ${route === "home" ? "active" : ""}`}
            onClick={() => navigate("home")}
            title="Home"
            aria-label="Home"
          >
            <Home size={18} />
          </button>
          {coreTabs.map((key) => {
            const resource = resources.find((r) => r.key === key);
            return (
              <button
                key={key}
                disabled={!resource && !meta.loading}
                className={route === key ? "active" : ""}
                onClick={() => navigate(key)}
              >
                <Icon name={key} size={16} />
                <span>
                  {key === "tax_payments" ? "Tax payments" : nice(key)}
                </span>
              </button>
            );
          })}
          <button
            className={route === "diagram" ? "active" : ""}
            onClick={() => navigate("diagram")}
          >
            <Network size={16} />
            <span>ER diagram</span>
          </button>
        </nav>
      </div>
      <main className="main-content">
        {meta.loading ? (
          <Loading />
        ) : meta.error ? (
          <ErrorPanel
            message={meta.error}
            onRetry={() => setRevision((v) => v + 1)}
          />
        ) : route === "home" ? (
          <DashboardPage
            actor={actor}
            resources={resources}
            revision={revision}
            navigate={navigate}
            create={openCreate}
            open={(key, row) => setDrawer({ resource: key, row })}
          />
        ) : route === "diagram" ? (
          <Suspense fallback={<Loading />}>
            <SchemaExplorer />
          </Suspense>
        ) : current ? (
          <RecordsPage
            key={current.key}
            resource={current}
            revision={revision}
            lookups={lookups}
            onCreate={() => openCreate(current.key)}
            onOpen={(row) => setDrawer({ resource: current.key, row })}
            onRefresh={() => setRevision((v) => v + 1)}
            navigate={navigate}
          />
        ) : (
          <Empty
            title="This section is unavailable"
            description="Your role may not have access to these records."
            action={
              <button
                className="button primary"
                onClick={() => navigate("home")}
              >
                Return home
              </button>
            }
          />
        )}
      </main>
      <footer className="footer">
        <span>
          <Layers3 size={14} /> LandLedger · Digital land registry
        </span>
        <span>Records with integrity. Ownership with clarity.</span>
        <button onClick={() => setHelp(true)}>
          Project guide <ArrowUpRight size={13} />
        </button>
      </footer>
      {drawer && resources.find((r) => r.key === drawer.resource) && (
        <RecordDrawer
          key={`${drawer.resource}-${drawer.row?.id || "new"}`}
          resource={resources.find((r) => r.key === drawer.resource)!}
          initial={drawer.row}
          create={drawer.create}
          defaults={drawer.defaults}
          actor={actor}
          lookups={lookups}
          resources={resources}
          onClose={() => setDrawer(null)}
          onChanged={changed}
          onCreateRelated={openCreate}
          onOpenRelated={(key, row) => setDrawer({ resource: key, row })}
        />
      )}{" "}
      {accounts && (
        <AccountsDrawer
          lookups={lookups}
          onClose={() => setAccounts(false)}
          onChanged={changed}
        />
      )}{" "}
      {help && <Guide onClose={() => setHelp(false)} />}{" "}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function DashboardPage({
  actor,
  resources,
  revision,
  navigate,
  create,
  open,
}: {
  actor: Actor;
  resources: Meta[];
  revision: number;
  navigate: (k: string) => void;
  create: (k: string) => void;
  open: (k: string, r: Row) => void;
}) {
  const { data, loading, error } = useLoad<Dashboard>("/dashboard", revision);
  const canCreate = resources.find((r) => r.key === "properties")?.canWrite;
  if (loading) return <Loading />;
  if (error) return <ErrorPanel message={error} />;
  if (!data) return null;
  const total = Number(data.properties);
  let running = 0;
  const segments = data.types
    .map((t) => {
      const start = running;
      running += total ? (Number(t.count) / total) * 100 : 0;
      return `${colors[t.label]} ${start}% ${running}%`;
    })
    .join(",");
  const stats = [
    {
      label: "Total properties",
      value: compact(data.properties),
      note: `${data.registered} registered parcels`,
      icon: Layers3,
      route: "properties",
    },
    {
      label:
        actor.role === "owner" ? "Your owner profile" : "Registered owners",
      value: compact(data.owners),
      note: "Connected ownership records",
      icon: UsersRound,
      route: "owners",
    },
    {
      label: "Pending transactions",
      value: compact(data.pending),
      note: "Awaiting review & approval",
      icon: FileCheck2,
      route: "transactions",
    },
    {
      label: "Tax payments recorded",
      value: money(data.tax),
      note: "Total receipts marked paid",
      icon: Wallet,
      route: "tax_payments",
    },
  ];
  const maxDistrict = Math.max(
    1,
    ...data.districts.map((d) => Number(d.count)),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="breadcrumb">
            <Home size={13} /> Workspace <span>/</span> Overview
          </div>
          <h1>
            Registry overview<span>.</span>
          </h1>
          <p>A clearer view of your properties, people, and pending work.</p>
        </div>
        <div className="heading-actions">
          <span className="today">
            <span className="tiny-label">TODAY</span>
            {date(new Date().toISOString())}
          </span>
          {canCreate && (
            <button
              className="button primary"
              onClick={() => create("properties")}
            >
              <Plus size={17} />
              Register property
            </button>
          )}
        </div>
      </div>
      <section className="welcome-banner">
        <div>
          <span className="eyebrow light">YOUR CONNECTED LAND REGISTRY</span>
          <h2>
            Good records.
            <br />
            <em>Confident decisions.</em>
          </h2>
          <p>
            Follow a parcel from registration to its latest ownership.
            <br />
            Everything you need, connected in one workspace.
          </p>
          <button onClick={() => navigate("properties")}>
            Explore property records <ArrowRight size={17} />
          </button>
        </div>
        <div className="banner-art">
          <ParcelArt />
          <span>
            <span />
            Illustrative parcels · live records below
          </span>
        </div>
        <div className="banner-seal">
          <ShieldCheck size={27} />
          <small>
            RECORDS BUILT
            <br />
            ON INTEGRITY
          </small>
        </div>
      </section>
      <section className="stats-grid">
        {stats.map((s) => (
          <button
            className="stat-card"
            key={s.label}
            onClick={() => navigate(s.route)}
            disabled={!resources.some((r) => r.key === s.route)}
          >
            <div className="stat-top">
              <span>{s.label}</span>
              <span className="stat-icon">
                <s.icon size={19} />
              </span>
            </div>
            <strong>{s.value}</strong>
            <div className="stat-bottom">
              <span>{s.note}</span>
              <ArrowUpRight size={16} />
            </div>
          </button>
        ))}
      </section>
      <div className="dashboard-grid">
        <section className="card property-card">
          <div className="card-heading">
            <div>
              <h3>Recently added properties</h3>
              <p>The latest parcels in your registry.</p>
            </div>
            <button
              className="text-button"
              onClick={() => navigate("properties")}
            >
              View all <ArrowRight size={15} />
            </button>
          </div>
          {data.recent.length ? (
            <div className="table-scroll">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Property</th>
                    <th>District</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => open("properties", r)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") open("properties", r);
                      }}
                    >
                      <td>
                        <div className="property-cell">
                          <span
                            className={`parcel-icon type-${r.property_type}`}
                          >
                            <Icon name="properties" size={18} />
                          </span>
                          <div>
                            <strong>{r.survey_no}</strong>
                            <small>{r.location}</small>
                          </div>
                        </div>
                      </td>
                      <td>{r.district_name}</td>
                      <td>{nice(r.property_type)}</td>
                      <td>
                        <Badge value={r.registration_status} />
                      </td>
                      <td>
                        <ArrowUpRight size={16} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty description="Create a property to begin building the registry." />
          )}
        </section>
        <section className="card type-card">
          <div className="card-heading">
            <div>
              <h3>Property mix</h3>
              <p>How your registered parcels are used.</p>
            </div>
            <Leaf size={18} />
          </div>
          <div className="donut-wrap">
            <div
              className="donut"
              style={{
                background: total ? `conic-gradient(${segments})` : "#edf0e9",
              }}
            >
              <div>
                <strong>{compact(total)}</strong>
                <span>PROPERTIES</span>
              </div>
            </div>
          </div>
          <div className="type-legend">
            {["residential", "commercial", "agricultural", "industrial"].map(
              (type) => {
                const n = Number(
                  data.types.find((t) => t.label === type)?.count || 0,
                );
                return (
                  <div key={type}>
                    <span>
                      <i style={{ background: colors[type] }} />
                      {nice(type)}
                    </span>
                    <strong>
                      {n}
                      <small>
                        {total ? Math.round((n / total) * 100) : 0}%
                      </small>
                    </strong>
                  </div>
                );
              },
            )}
          </div>
        </section>
        <section className="card district-card">
          <div className="card-heading">
            <div>
              <h3>Across districts</h3>
              <p>Property distribution by jurisdiction.</p>
            </div>
            <MapPinned size={18} />
          </div>
          <div className="district-bars">
            {data.districts.length ? (
              data.districts.map((d) => (
                <div key={d.label}>
                  <div>
                    <span>{d.label}</span>
                    <strong>
                      {d.count}
                      <small> parcels</small>
                    </strong>
                  </div>
                  <div className="bar-track">
                    <span
                      style={{
                        width: `${(Number(d.count) / maxDistrict) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <Empty
                title="No district activity"
                description="Properties appear here after they are added."
              />
            )}
          </div>
          <button className="text-button" onClick={() => navigate("districts")}>
            Explore districts <ArrowRight size={15} />
          </button>
        </section>
        <section className="card activity-card">
          <div className="card-heading">
            <div>
              <h3>Recent registry activity</h3>
              <p>A traceable record of changes.</p>
            </div>
            <History size={18} />
          </div>
          {data.activity.length ? (
            <div className="activity-list">
              {data.activity.map((a) => (
                <div key={a.id}>
                  <span className="activity-icon">
                    <Check size={14} />
                  </span>
                  <div>
                    <strong>
                      {nice(a.entity_type)} · {nice(a.action)}
                    </strong>
                    <small>
                      {a.username} <span>·</span> {date(a.occurred_at)}
                    </small>
                  </div>
                  <ArrowUpRight size={14} />
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="Your workspace is ready"
              description="Authorized audit activity appears here as records change."
            />
          )}
          {resources.some((r) => r.key === "audit_events") && (
            <button
              className="text-button"
              onClick={() => navigate("audit_events")}
            >
              Open audit trail <ArrowRight size={15} />
            </button>
          )}
        </section>
        <section className="quick-card">
          <span className="eyebrow">MOVE WORK FORWARD</span>
          <h3>
            A place for every
            <br />
            part of the process.
          </h3>
          <p>
            Start a service request or review the records behind a property.
          </p>
          {resources.some((r) => r.key === "applications") && (
            <button onClick={() => navigate("applications")}>
              <ClipboardList size={19} />
              <span>Service applications</span>
              <ArrowRight size={16} />
            </button>
          )}
          {resources.some((r) => r.key === "certificates") && (
            <button onClick={() => navigate("certificates")}>
              <FileCheck2 size={19} />
              <span>Encumbrance certificates</span>
              <ArrowRight size={16} />
            </button>
          )}
          <button onClick={() => navigate("ownerships")}>
            <Fingerprint size={19} />
            <span>Ownership history</span>
            <ArrowRight size={16} />
          </button>
        </section>
      </div>
    </>
  );
}

function RecordsPage({
  resource: r,
  revision,
  lookups,
  onCreate,
  onOpen,
  onRefresh,
  navigate,
}: {
  resource: Meta;
  revision: number;
  lookups: Lookups;
  onCreate: () => void;
  onOpen: (r: Row) => void;
  onRefresh: () => void;
  navigate: (key: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    setQuery("");
    setSearch("");
    setPage(1);
    setStatus("");
  }, [r.key]);
  const result = useLoad<RecordPage>(
    `/records/${r.key}?q=${encodeURIComponent(search)}&page=${page}&status=${encodeURIComponent(status)}`,
    revision,
  );
  const sk = statusKey(r);
  const sf = r.fields.find((f) => f.key === sk);
  const secondary =
    r.key === "properties"
      ? "ownerships"
      : r.key === "transactions"
        ? "applications"
        : r.key === "encumbrances"
          ? "certificates"
          : null;
  function exportCsv() {
    if (!result.data) return;
    const columns = r.columns;
    const rows = [
      columns.map(nice),
      ...result.data.rows.map((row) =>
        columns.map((k) =>
          display(
            row[k],
            r.fields.find((f) => f.key === k),
            lookups,
          ),
        ),
      ),
    ];
    const content = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `landledger-${r.key}-page-${page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="breadcrumb">
            <Home size={13} />
            Workspace<span>/</span>
            {r.title}
          </div>
          <h1>
            {r.title}
            <span>.</span>
          </h1>
          <p>{r.description}</p>
        </div>
        <div className="heading-actions">
          {secondary && (
            <button
              className="button secondary"
              onClick={() => navigate(secondary)}
            >
              <Icon name={secondary} />
              {nice(secondary)}
            </button>
          )}
          {r.canWrite && (
            <button className="button primary" onClick={onCreate}>
              <Plus size={17} />
              Add {r.singular.toLowerCase()}
            </button>
          )}
        </div>
      </div>
      <section className="card records-card">
        <div className="records-toolbar">
          <div className="search-field">
            <Search size={18} />
            <input
              aria-label={`Search ${r.title}`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${r.title.toLowerCase()}…`}
            />
            {query && (
              <button aria-label="Clear search" onClick={() => setQuery("")}>
                <X size={15} />
              </button>
            )}
          </div>
          <div className="table-tools">
            {sf?.options && (
              <select
                aria-label="Filter by status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All statuses</option>
                {sf.options.map((s) => (
                  <option key={s} value={s}>
                    {nice(s)}
                  </option>
                ))}
              </select>
            )}
            <button
              className="button secondary small"
              onClick={onRefresh}
              title="Refresh records"
              aria-label="Refresh records"
            >
              <RefreshCw size={16} />
            </button>
            <button
              className="button secondary small"
              disabled={!result.data?.rows.length}
              onClick={exportCsv}
            >
              <ArrowDownToLine size={16} />
              Export page
            </button>
          </div>
        </div>
        {result.loading ? (
          <Loading />
        ) : result.error ? (
          <ErrorPanel message={result.error} onRetry={onRefresh} />
        ) : result.data?.rows.length ? (
          <div className="table-scroll">
            <table className="records-table">
              <thead>
                <tr>
                  <th className="row-num">#</th>
                  {r.columns.map((key) => (
                    <th key={key}>
                      {r.fields.find((f) => f.key === key)?.label || nice(key)}
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {result.data.rows.map((row, i) => (
                  <tr
                    key={row.id}
                    onClick={() => onOpen(row)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onOpen(row);
                    }}
                  >
                    <td className="row-num">
                      {String((page - 1) * 10 + i + 1).padStart(2, "0")}
                    </td>
                    {r.columns.map((key, j) => (
                      <td key={key}>
                        {key === sk ? (
                          <Badge value={row[key]} />
                        ) : j === 0 ? (
                          <div className="record-primary">
                            <span className="record-icon">
                              <Icon name={r.key} size={16} />
                            </span>
                            <strong>
                              {display(
                                row[key],
                                r.fields.find((f) => f.key === key),
                                lookups,
                              )}
                            </strong>
                          </div>
                        ) : (
                          display(
                            row[key],
                            r.fields.find((f) => f.key === key),
                            lookups,
                          )
                        )}
                      </td>
                    ))}
                    <td>
                      <button
                        className="row-open"
                        aria-label={`View ${r.singular.toLowerCase()} ${row[r.label] || row.id}`}
                      >
                        <ArrowUpRight size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={
              search || status
                ? "No matching records"
                : `No ${r.title.toLowerCase()} yet`
            }
            description={
              search || status
                ? "Try a different search or status filter."
                : `Add a ${r.singular.toLowerCase()} to start this section.`
            }
            action={
              r.canWrite && !search && !status ? (
                <button className="button primary" onClick={onCreate}>
                  <Plus size={17} />
                  Add {r.singular.toLowerCase()}
                </button>
              ) : undefined
            }
          />
        )}
        <div className="table-footer">
          <span>
            {result.data
              ? `${result.data.total} records · showing ${result.data.rows.length ? (page - 1) * 10 + 1 : 0}–${Math.min(page * 10, result.data.total)}`
              : "Loading records"}
          </span>
          <div>
            <button
              aria-label="Previous page"
              disabled={page <= 1 || result.loading}
              onClick={() => setPage((v) => v - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              Page {page} of{" "}
              {Math.max(1, Math.ceil((result.data?.total || 0) / 10))}
            </span>
            <button
              aria-label="Next page"
              disabled={
                !result.data || page * 10 >= result.data.total || result.loading
              }
              onClick={() => setPage((v) => v + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>
      <div className="records-note">
        <ShieldCheck size={16} />
        <span>
          Connected to CockroachDB. Finalized records are preserved for a
          complete history.
        </span>
      </div>
    </>
  );
}
function display(value: any, field?: Field, lookups: Lookups = {}) {
  if (value === null || value === undefined || value === "") return "—";
  if (field?.type === "reference")
    return (
      lookups[field.reference!]?.find((o) => o.id === value)?.label ||
      String(value).slice(0, 8)
    );
  if (field?.type === "date") return date(value);
  if (field?.type === "boolean") return value ? "Active" : "Inactive";
  if (field?.type === "json") return JSON.stringify(value, null, 2);
  if (["amount", "consideration", "market_value"].includes(field?.key || ""))
    return money(value);
  if (field?.key === "share")
    return `${Number((Number(value) * 100).toFixed(6))}%`;
  if (field?.type === "select") return nice(value);
  return String(value);
}

function Drawer({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input, select, textarea, a[href], [tabindex="0"]',
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`drawer ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <div className="drawer-header">
          <div>
            <span className="eyebrow">REGISTRY RECORD</span>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            aria-label="Close panel"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FieldInput({
  field: f,
  value,
  onChange,
  lookups,
  data,
}: {
  field: Field;
  value: any;
  onChange: (v: any) => void;
  lookups: Lookups;
  data: Row;
}) {
  let options = lookups[f.reference || ""] || [];
  if (f.designation)
    options = options.filter(
      (o) => o.designation === f.designation && o.active,
    );
  if (f.designation && data.property_id) {
    const office = lookups.properties?.find(
      (p) => p.id === data.property_id,
    )?.office_id;
    if (office) options = options.filter((o) => o.office_id === office);
  }
  if (f.key === "office_id" && data.district_id)
    options = options.filter((o) => o.district_id === data.district_id);
  if (
    ["transactions", "documents", "applications"].includes(f.reference || "") &&
    data.property_id
  )
    options = options.filter((o) => o.property_id === data.property_id);
  if (f.reference === "applications")
    options = options.filter(
      (o) =>
        o.service_type === "encumbrance_certificate" &&
        ["submitted", "under_review"].includes(o.status || ""),
    );
  if (f.reference === "transactions" && (data.document_type || data.role))
    options = options.filter((o) => o.status === "pending");
  if (
    f.reference === "transactions" &&
    ["registration", "transfer"].includes(data.service_type)
  )
    options = options.filter(
      (o) =>
        (o.transaction_type === "registration") ===
        (data.service_type === "registration"),
    );
  const common = {
    required: f.required,
    id: `field-${f.key}`,
    value: value ?? "",
    onChange: (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => onChange(e.target.value),
  };
  return (
    <label
      className={f.type === "textarea" ? "field full-field" : "field"}
      htmlFor={`field-${f.key}`}
    >
      <span>
        {f.label}
        {f.required && <b>*</b>}
      </span>
      {f.type === "reference" ? (
        <select {...common}>
          <option value="">Select {f.label.toLowerCase()}</option>
          {options.map((o) => (
            <option value={o.id} key={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      ) : f.type === "select" ? (
        <select {...common}>
          <option value="">Select {f.label.toLowerCase()}</option>
          {f.options?.map((o) => (
            <option value={o} key={o}>
              {nice(o)}
            </option>
          ))}
        </select>
      ) : f.type === "textarea" ? (
        <textarea {...common} rows={3} />
      ) : f.type === "boolean" ? (
        <select
          id={common.id}
          value={String(value ?? true)}
          onChange={(e) => onChange(e.target.value === "true")}
        >
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      ) : (
        <input
          {...common}
          type={
            f.type === "date"
              ? "date"
              : f.type === "email"
                ? "email"
                : f.type === "number"
                  ? "number"
                  : "text"
          }
          min={f.min}
          step={
            f.type === "number"
              ? f.scale === 0
                ? "1"
                : String(10 ** -(f.scale ?? 2))
              : undefined
          }
          max={f.key === "share" ? 1 : f.key === "tax_year" ? 2200 : undefined}
          maxLength={500}
        />
      )}
    </label>
  );
}

function RecordDrawer({
  resource: r,
  initial,
  create,
  defaults,
  actor,
  lookups,
  resources,
  onClose,
  onChanged,
  onCreateRelated,
  onOpenRelated,
}: {
  resource: Meta;
  initial?: Row;
  create?: boolean;
  defaults?: Row;
  actor: Actor;
  lookups: Lookups;
  resources: Meta[];
  onClose: () => void;
  onChanged: (s?: string) => void;
  onCreateRelated: (k: string, d?: Row) => void;
  onOpenRelated: (k: string, r: Row) => void;
}) {
  const [row, setRow] = useState<Row | undefined>(initial);
  const [editing, setEditing] = useState(!!create);
  const [data, setData] = useState<Row>(() => initialData(r, defaults, actor));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [officerId, setOfficerId] = useState(actor.officer_id || "");
  const [related, setRelated] = useState<Record<string, Row[]>>({});
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [detailLoading, setDetailLoading] = useState(!create);
  useEffect(() => {
    let alive = true;
    if (!row?.id) return;
    api<Row>(`/records/${r.key}/${row.id}`)
      .then((value) => {
        if (alive) {
          setRow(value);
          setData(
            Object.fromEntries(
              r.fields
                .filter((f) => !f.readOnly)
                .map((f) => [f.key, value[f.key] ?? ""]),
            ),
          );
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setDetailLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [r.key, row?.id, refresh]);
  useEffect(() => {
    let alive = true;
    if (!row?.id) return;
    const keys =
      r.key === "properties"
        ? [
            "ownerships",
            "transactions",
            "surveys",
            "valuations",
            "documents",
            "encumbrances",
            "tax_payments",
            "mutations",
            "applications",
            "certificates",
          ]
        : r.key === "transactions"
          ? ["transaction_parties", "documents"]
          : r.key === "owners"
            ? ["ownerships"]
            : [];
    Promise.all(
      keys
        .filter((key) => resources.some((x) => x.key === key))
        .map(async (key) => {
          const filter =
            r.key === "transactions"
              ? "transaction_id"
              : r.key === "owners"
                ? "owner_id"
                : "property_id";
          try {
            return [
              key,
              (
                await api<RecordPage>(
                  `/records/${key}?${filter}=${row.id}&limit=100`,
                )
              ).rows,
            ] as const;
          } catch {
            return [key, []] as const;
          }
        }),
    ).then((entries) => {
      if (alive) setRelated(Object.fromEntries(entries));
    });
    return () => {
      alive = false;
    };
  }, [r.key, row?.id, refresh, resources]);
  const finalized =
    row &&
    ((r.key === "transactions" && row.status !== "pending") ||
      (r.key === "documents" && row.verification_status !== "pending") ||
      (r.key === "surveys" && row.survey_status === "completed") ||
      ["valuations", "certificates", "ownerships", "audit_events"].includes(
        r.key,
      ) ||
      (r.key === "tax_payments" && row.payment_status === "paid") ||
      (r.key === "properties" && row.registration_status === "registered") ||
      (["mutations", "applications"].includes(r.key) &&
        ["approved", "rejected"].includes(row.status)) ||
      (r.key === "encumbrances" && row.status === "released"));
  const mayReview =
    row &&
    ["administrator", "sub_registrar"].includes(actor.role) &&
    ["transactions", "documents", "mutations", "applications"].includes(
      r.key,
    ) &&
    !finalized;
  const selectedPropertyId = editing ? data.property_id : row?.property_id;
  const selectedOfficeId =
    row?.office_id ||
    lookups.properties?.find((p) => p.id === selectedPropertyId)?.office_id;
  const availableOfficers = (lookups.officers || []).filter(
    (o) =>
      o.designation === "sub_registrar" &&
      o.active &&
      (!selectedOfficeId || o.office_id === selectedOfficeId),
  );
  useEffect(() => {
    if (
      actor.role === "administrator" &&
      selectedOfficeId &&
      officerId &&
      !availableOfficers.some((o) => o.id === officerId)
    )
      setOfficerId("");
  }, [selectedOfficeId, officerId, actor.role, lookups.officers]);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const value = await api<Row>(
        `/records/${r.key}${create ? "" : `/${row!.id}`}`,
        {
          method: create ? "POST" : "PATCH",
          body: JSON.stringify({ data, officer_id: officerId || undefined }),
        },
      );
      setRow(value);
      setEditing(false);
      onChanged();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function review(action: string) {
    setBusy(true);
    setError("");
    try {
      setRow(
        await api<Row>(`/records/${r.key}/${row!.id}/review`, {
          method: "POST",
          body: JSON.stringify({ action, officer_id: officerId || undefined }),
        }),
      );
      setRefresh((v) => v + 1);
      onChanged(
        `Record ${action === "approve" ? (r.key === "documents" ? "verified" : "approved") : action === "reject" ? "rejected" : "marked under review"}.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      await api(`/documents/${row!.id}/file`, { method: "POST", body: form });
      setRefresh((v) => v + 1);
      onChanged("Digital copy uploaded.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await api(`/records/${r.key}/${row!.id}`, { method: "DELETE" });
      onChanged("Unfinalized record removed.");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const title = create
    ? `Add ${r.singular.toLowerCase()}`
    : editing
      ? `Edit ${r.singular.toLowerCase()}`
      : r.singular;
  return (
    <Drawer
      title={title}
      subtitle={
        create
          ? r.description
          : row?.id
            ? `Record ${row.id.slice(0, 8).toUpperCase()}`
            : undefined
      }
      onClose={onClose}
      wide
    >
      <div className="drawer-body">
        {error && (
          <div className="form-error" role="alert">
            <AlertCircle size={17} />
            {error}
          </div>
        )}
        {detailLoading ? (
          <Loading />
        ) : editing ? (
          <form id="record-form" onSubmit={save}>
            <div className="form-grid">
              {r.fields
                .filter((f) => !f.readOnly)
                .map((f) => (
                  <FieldInput
                    key={f.key}
                    field={f}
                    value={data[f.key]}
                    data={data}
                    lookups={lookups}
                    onChange={(v) =>
                      setData((current) => ({
                        ...current,
                        [f.key]: v,
                        ...(f.key === "district_id" ? { office_id: "" } : {}),
                        ...(f.key === "property_id"
                          ? {
                              ...(r.fields.some(
                                (x) => x.key === "transaction_id",
                              )
                                ? { transaction_id: "" }
                                : {}),
                              ...(r.fields.some((x) => x.key === "document_id")
                                ? { document_id: "" }
                                : {}),
                              ...(r.fields.some(
                                (x) => x.key === "application_id",
                              )
                                ? { application_id: "" }
                                : {}),
                              ...(r.key === "transactions"
                                ? {
                                    office_id:
                                      lookups.properties?.find(
                                        (p) => p.id === v,
                                      )?.office_id || "",
                                  }
                                : {}),
                            }
                          : {}),
                      }))
                    }
                  />
                ))}
              {r.key === "certificates" && actor.role === "administrator" && (
                <label className="field full-field">
                  <span>
                    Issuing sub-registrar<b>*</b>
                  </span>
                  <select
                    required
                    value={officerId}
                    onChange={(e) => setOfficerId(e.target.value)}
                  >
                    <option value="">Select an active sub-registrar</option>
                    {availableOfficers.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="form-tip">
              <ShieldCheck size={17} />
              {r.key === "transactions"
                ? "After saving, add transfer parties, upload the deed, and verify it before approval."
                : r.key === "documents"
                  ? "Save the document details first, then upload its digital copy."
                  : r.key === "properties"
                    ? "Ownership is assigned through an approved registration transaction."
                    : "Required fields are marked with an asterisk. Records are validated before saving."}
            </div>
          </form>
        ) : (
          row && (
            <>
              <div className="detail-top">
                <div className="detail-icon">
                  <Icon name={r.key} size={26} />
                </div>
                <div>
                  <h3>
                    {display(
                      row[r.label],
                      r.fields.find((f) => f.key === r.label),
                      lookups,
                    )}
                  </h3>
                  {statusKey(r) && <Badge value={row[statusKey(r)!]} />}
                </div>
                {r.canWrite && !finalized && (
                  <button
                    className="button secondary small"
                    onClick={() => setEditing(true)}
                  >
                    Edit record
                  </button>
                )}
              </div>
              <dl className="detail-grid">
                {r.fields
                  .filter((f) => row[f.key] !== undefined)
                  .map((f) => (
                    <div
                      key={f.key}
                      className={
                        ["textarea", "json"].includes(f.type)
                          ? "full-field"
                          : ""
                      }
                    >
                      <dt>{f.label}</dt>
                      <dd className={f.type === "json" ? "json-value" : ""}>
                        {display(row[f.key], f, lookups)}
                      </dd>
                    </div>
                  ))}
                <div>
                  <dt>Created</dt>
                  <dd>{date(row.created_at || row.occurred_at)}</dd>
                </div>
              </dl>
              {r.key === "documents" && (
                <section className="detail-section">
                  <h4>Digital copy</h4>
                  {row.original_filename ? (
                    <div className="file-card">
                      <FileText size={23} />
                      <div>
                        <strong>{row.original_filename}</strong>
                        <small>
                          {(Number(row.file_size) / 1024).toFixed(1)} KB ·
                          SHA-256 recorded
                        </small>
                      </div>
                      <a
                        className="button secondary small"
                        href={`/api/documents/${row.id}/file`}
                        download
                      >
                        <ArrowDownToLine size={16} />
                        Download
                      </a>
                    </div>
                  ) : (
                    <p className="muted">No digital copy has been uploaded.</p>
                  )}
                  {r.canWrite && !finalized && (
                    <label
                      className={`upload-button ${busy ? "disabled" : ""}`}
                    >
                      <Upload size={17} />
                      {busy
                        ? "Uploading…"
                        : row.original_filename
                          ? "Replace digital copy"
                          : "Upload digital copy"}
                      <input
                        type="file"
                        accept="application/pdf,image/png,image/jpeg"
                        disabled={busy}
                        onChange={(e) => {
                          if (e.target.files?.[0])
                            void upload(e.target.files[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                  <small className="muted">
                    PDF, PNG or JPEG · maximum 10 MB
                  </small>
                </section>
              )}
              {mayReview && (
                <section className="review-panel">
                  <span className="eyebrow">VERIFICATION & APPROVAL</span>
                  <p>
                    {r.key === "transactions"
                      ? "Approving this transaction updates ownership and preserves the previous entries in one database transaction."
                      : r.key === "documents"
                        ? "Verify the uploaded digital copy before approving the related transaction."
                        : "Review the supporting records before finalizing this request."}
                  </p>
                  {actor.role === "administrator" && (
                    <label className="field">
                      <span>Reviewing sub-registrar</span>
                      <select
                        value={officerId}
                        onChange={(e) => setOfficerId(e.target.value)}
                      >
                        <option value="">Select the officer</option>
                        {availableOfficers.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="review-actions">
                    <button
                      className="button primary small"
                      disabled={busy}
                      onClick={() => void review("approve")}
                    >
                      <Check size={16} />
                      {r.key === "documents" ? "Verify document" : "Approve"}
                    </button>
                    {r.key === "applications" && (
                      <button
                        className="button secondary small"
                        disabled={busy}
                        onClick={() => void review("under_review")}
                      >
                        Mark under review
                      </button>
                    )}
                    <button
                      className="button danger small"
                      disabled={busy}
                      onClick={() => void review("reject")}
                    >
                      Reject
                    </button>
                  </div>
                </section>
              )}
              {Object.entries(related).map(([key, rows]) => {
                const meta = resources.find((x) => x.key === key)!;
                const canAdd =
                  meta.canWrite &&
                  (key === "transaction_parties" || key === "documents") &&
                  r.key === "transactions" &&
                  !finalized;
                return (
                  <section className="detail-section" key={key}>
                    <div className="section-title">
                      <h4>
                        {meta.title}
                        <span>{rows.length}</span>
                      </h4>
                      {canAdd && (
                        <button
                          className="text-button"
                          onClick={() =>
                            onCreateRelated(key, {
                              transaction_id: row.id,
                              ...(key === "documents"
                                ? { property_id: row.property_id }
                                : {}),
                            })
                          }
                        >
                          <Plus size={14} />
                          Add
                        </button>
                      )}
                    </div>
                    {rows.length ? (
                      <div className="related-list">
                        {rows.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => onOpenRelated(key, item)}
                          >
                            <span className="record-icon">
                              <Icon name={key} size={16} />
                            </span>
                            <div>
                              <strong>
                                {display(
                                  item[meta.label],
                                  meta.fields.find((f) => f.key === meta.label),
                                  lookups,
                                )}
                              </strong>
                              <small>
                                {key === "ownerships"
                                  ? `${display(item.share, { key: "share" } as Field)} · ${date(item.valid_from)} — ${item.valid_to ? date(item.valid_to) : "Present"}`
                                  : key === "transaction_parties"
                                    ? `${nice(item.role)} · ${Number(item.share) * 100}%`
                                    : nice(
                                        item.status ||
                                          item.verification_status ||
                                          item.property_type ||
                                          "Record",
                                      )}
                              </small>
                            </div>
                            <ArrowUpRight size={16} />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="muted">
                        No related {meta.title.toLowerCase()}.
                      </p>
                    )}
                  </section>
                );
              })}
              {r.key === "properties" && (
                <div className="detail-shortcuts">
                  {[
                    "transactions",
                    "applications",
                    "surveys",
                    "valuations",
                    "documents",
                    "encumbrances",
                    "tax_payments",
                    "mutations",
                  ]
                    .filter(
                      (key) => resources.find((x) => x.key === key)?.canWrite,
                    )
                    .map((key) => (
                      <button
                        className="button secondary small"
                        key={key}
                        onClick={() =>
                          onCreateRelated(key, {
                            property_id: row.id,
                            ...(key === "transactions"
                              ? { office_id: row.office_id }
                              : {}),
                          })
                        }
                      >
                        <Plus size={14} />
                        {nice(key)}
                      </button>
                    ))}
                </div>
              )}
              {actor.role === "administrator" && r.canWrite && !finalized && (
                <div className="delete-zone">
                  {deleteConfirm ? (
                    <>
                      <p>
                        Remove this unfinalized record? Referenced records
                        cannot be removed.
                      </p>
                      <button
                        className="button danger small"
                        disabled={busy}
                        onClick={() => void remove()}
                      >
                        Confirm removal
                      </button>
                      <button
                        className="text-button"
                        onClick={() => setDeleteConfirm(false)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      className="text-button danger-text"
                      onClick={() => setDeleteConfirm(true)}
                    >
                      Remove unfinalized record
                    </button>
                  )}
                </div>
              )}
            </>
          )
        )}
      </div>
      <div className="drawer-footer">
        <button
          className="button secondary"
          onClick={
            editing && !create
              ? () => {
                  setEditing(false);
                  setError("");
                }
              : onClose
          }
        >
          {editing ? "Cancel" : "Close record"}
        </button>
        {editing && (
          <button form="record-form" className="button primary" disabled={busy}>
            {busy ? (
              <Loader2 className="spin" size={17} />
            ) : (
              <Check size={17} />
            )}
            Save {r.singular.toLowerCase()}
          </button>
        )}
      </div>
    </Drawer>
  );
}
function initialData(r: Meta, defaults: Row | undefined, actor: Actor) {
  return Object.fromEntries(
    r.fields
      .filter((f) => !f.readOnly)
      .map((f) => [
        f.key,
        defaults?.[f.key] ??
          (f.type === "date"
            ? new Date().toISOString().slice(0, 10)
            : f.type === "boolean"
              ? true
              : f.key === "applicant_owner_id"
                ? actor.owner_id || ""
                : f.key === "officer_id"
                  ? actor.officer_id || ""
                  : f.key === "consideration"
                    ? "0"
                    : ""),
      ]),
  );
}

function AccountsDrawer({
  lookups,
  onClose,
  onChanged,
}: {
  lookups: Lookups;
  onClose: () => void;
  onChanged: (s?: string) => void;
}) {
  const [revision, setRevision] = useState(0);
  const accounts = useLoad<Row[]>("/accounts", revision);
  const [adding, setAdding] = useState(false);
  const [data, setData] = useState<Row>({
    username: "",
    password: "",
    role: "owner",
    owner_id: "",
    officer_id: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/accounts", { method: "POST", body: JSON.stringify(data) });
      setAdding(false);
      setRevision((v) => v + 1);
      onChanged("User account created.");
      setData({
        username: "",
        password: "",
        role: "owner",
        owner_id: "",
        officer_id: "",
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Drawer
      title="User accounts"
      subtitle="Role-based access to the registry workspace."
      onClose={onClose}
    >
      <div className="drawer-body">
        {adding ? (
          <form onSubmit={save} className="account-form">
            <label className="field">
              <span>Username</span>
              <input
                required
                value={data.username}
                onChange={(e) => setData({ ...data, username: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Password · at least 12 characters</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                value={data.password}
                onChange={(e) => setData({ ...data, password: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Role</span>
              <select
                value={data.role}
                onChange={(e) =>
                  setData({
                    ...data,
                    role: e.target.value,
                    owner_id: "",
                    officer_id: "",
                  })
                }
              >
                {[
                  "administrator",
                  "owner",
                  "survey_officer",
                  "valuation_officer",
                  "sub_registrar",
                  "bank_verifier",
                  "auditor",
                ].map((r) => (
                  <option value={r} key={r}>
                    {nice(r)}
                  </option>
                ))}
              </select>
            </label>
            {data.role === "owner" && (
              <FieldInput
                field={{
                  key: "owner_id",
                  label: "Linked owner",
                  type: "reference",
                  reference: "owners",
                  required: true,
                }}
                value={data.owner_id}
                lookups={lookups}
                data={data}
                onChange={(v) => setData({ ...data, owner_id: v })}
              />
            )}{" "}
            {[
              "survey_officer",
              "valuation_officer",
              "sub_registrar",
              "auditor",
            ].includes(data.role) && (
              <FieldInput
                field={{
                  key: "officer_id",
                  label: "Linked officer",
                  type: "reference",
                  reference: "officers",
                  designation: data.role,
                  required: true,
                }}
                value={data.officer_id}
                lookups={lookups}
                data={data}
                onChange={(v) => setData({ ...data, officer_id: v })}
              />
            )}{" "}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="review-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setAdding(false)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={busy}>
                Create account
              </button>
            </div>
          </form>
        ) : (
          <>
            <button className="button primary" onClick={() => setAdding(true)}>
              <Plus size={16} />
              Add user account
            </button>
            {accounts.loading ? (
              <Loading />
            ) : accounts.error ? (
              <ErrorPanel message={accounts.error} />
            ) : (
              <div className="accounts-list">
                {accounts.data?.map((a) => (
                  <div key={a.id}>
                    <span className="avatar">
                      {a.username.slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <strong>{a.username}</strong>
                      <small>{nice(a.role)}</small>
                    </div>
                    <Badge value={a.active ? "active" : "inactive"} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}
function Guide({ onClose }: { onClose: () => void }) {
  return (
    <Drawer
      title="Project guide"
      subtitle="Digital Land Registration & Property Management System"
      onClose={onClose}
    >
      <div className="drawer-body guide">
        <h3>Register a property</h3>
        <ol>
          <li>Add its district, registration office and officers.</li>
          <li>Create an owner profile and a property record.</li>
          <li>
            Create a registration transaction and add transferees whose shares
            total 1 (100%).
          </li>
          <li>
            Add a registration deed, upload its digital copy and verify it as a
            sub-registrar.
          </li>
          <li>
            Approve the transaction. Ownership and registration update together.
          </li>
        </ol>
        <h3>Transfer ownership</h3>
        <p>
          Create a sale, inheritance or gift transaction. Add transferors and
          transferees with matching shares, then upload and verify the matching
          deed. Approval preserves historical ownership and creates a pending
          mutation.
        </p>
        <h3>Explore the database</h3>
        <p>
          Each of the twelve tabs has searchable records and an entry form. Open
          a record to see its details and related data. The account menu opens
          service applications, certificates, ownership history, accounts and
          the audit trail.
        </p>
        <h3>Why CockroachDB?</h3>
        <p>
          Foreign keys keep related records valid. Serializable transactions
          make ownership updates atomic and handle concurrent requests. The
          backend retries serialization conflicts and revalidates the ownership
          share.
        </p>
        <div className="form-tip">
          <ShieldCheck size={20} />
          This is a student project. Seeded records and generated certificates
          are demonstration data, not official land records. The single-node
          setup demonstrates transactions; distributed resilience requires a
          multi-node deployment.
        </div>
      </div>
    </Drawer>
  );
}
