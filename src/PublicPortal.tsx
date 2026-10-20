import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  Search,
  LogOut,
  ShieldCheck,
  MapPin,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { Actor } from "../server/resources";
import type {
  PublicOverview,
  PublicPage,
  PublicProperty,
} from "../shared/public";
import { api } from "./api";
import { useLiveUpdates } from "./useLiveUpdates";

const title = (value: string) =>
  value.replace(/_/g, " ").replace(/^./, (s) => s.toUpperCase());
const date = (value: string | null) =>
  value
    ? new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Not recorded";

export default function PublicPortal({
  actor,
  brand,
  onLogout,
}: {
  actor: Actor;
  brand: ReactNode;
  onLogout: () => void;
}) {
  const [overview, setOverview] = useState<PublicOverview | null>(null);
  const [records, setRecords] = useState<PublicPage | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [district, setDistrict] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<PublicProperty | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const liveStatus = useLiveUpdates(() => setRevision((v) => v + 1));
  const loaded = useRef(false);
  const detailId = detail?.id;
  useEffect(() => {
    setDetail(null);
  }, [search, district, page]);
  useEffect(() => {
    if (!detailId) return;
    const abort = new AbortController();
    api<PublicProperty>(`/public/properties/${detailId}`, {
      signal: abort.signal,
    })
      .then(setDetail)
      .catch((e) => {
        if (!abort.signal.aborted) {
          setDetail(null);
          setError(e.message);
        }
      });
    return () => abort.abort();
  }, [detailId, revision]);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (detail) detailHeading.current?.focus();
  }, [detail]);
  useEffect(() => {
    const abort = new AbortController();
    api<PublicOverview>("/public/overview", { signal: abort.signal })
      .then(setOverview)
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => abort.abort();
  }, [revision]);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(!loaded.current);
    setError("");
    const params = new URLSearchParams({
      q: search,
      district,
      page: String(page),
    });
    api<PublicPage>(`/public/properties?${params}`, { signal: abort.signal })
      .then((value) => {
        loaded.current = true;
        setRecords(value);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [search, district, page, revision]);
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
      onLogout();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function openDetail(id: string) {
    setDetailLoading(true);
    setError("");
    try {
      setDetail(await api<PublicProperty>(`/public/properties/${id}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDetailLoading(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    setSearch(query.trim());
    setPage(1);
    setRevision((v) => v + 1);
  }
  return (
    <div className="public-portal">
      <header className="public-topbar">
        {brand}
        <div className="public-account">
          <span className={`live-status ${liveStatus}`} role="status">
            {liveStatus === "live" ? "Live updates" : "Connecting updates"}
          </span>
          <span>
            <strong>Public user</strong>
            <small>{actor.username}</small>
          </span>
          <button className="button secondary" onClick={logout}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </header>
      <main className="public-main">
        <section className="public-intro">
          <div>
            <span className="eyebrow">PUBLIC PROPERTY RECORDS</span>
            <h1>Explore registered land.</h1>
            <p>
              Find registered properties across districts. Only information
              approved for this public portal is displayed.
            </p>
          </div>
          <div className="public-total">
            <strong>{overview?.total.toLocaleString("en-IN") ?? "—"}</strong>
            <span>Registered properties</span>
          </div>
        </section>
        <div className="public-notice">
          <ShieldCheck size={20} />
          <p>
            This account can view records only. For ownership verification,
            certified documents, corrections or services, contact the
            registration office. Locations, encumbrances, owner identities and
            private documents are protected.
          </p>
        </div>
        <section
          className="public-results"
          aria-labelledby="property-list-title"
        >
          <div className="public-section-head">
            <div>
              <h2 id="property-list-title">Property directory</h2>
              <p>
                Search by survey number, type, district or registration office.
              </p>
            </div>
          </div>
          <form className="public-search" onSubmit={submit}>
            <label>
              <span>Search properties</span>
              <input
                maxLength={200}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Survey number, type or district"
              />
            </label>
            <label>
              <span>District</span>
              <select
                value={district}
                onChange={(e) => {
                  setDistrict(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All districts</option>
                {overview?.districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.district_name} · {d.state_name}
                  </option>
                ))}
              </select>
            </label>
            <button className="button primary" type="submit">
              <Search size={16} /> Search
            </button>
          </form>
          {error && (
            <div className="form-error" role="alert">
              {error}
              <button
                className="button secondary"
                onClick={() => setRevision((v) => v + 1)}
              >
                Retry
              </button>
            </div>
          )}
          <div aria-live="polite">
            {loading ? (
              <p className="public-empty">Loading registered properties…</p>
            ) : records?.rows.length ? (
              <>
                <div className="public-property-grid">
                  {records.rows.map((row) => (
                    <article className="public-property" key={row.id}>
                      <span className="public-type">
                        {title(row.property_type)}
                      </span>
                      <h3>{row.survey_no}</h3>
                      <p className="public-location">
                        <MapPin size={16} />
                        {row.district_name} · {row.state_name}
                      </p>
                      <dl>
                        <div>
                          <dt>Registration office</dt>
                          <dd>{row.office_name}</dd>
                        </div>
                        <div>
                          <dt>Area</dt>
                          <dd>{row.area} m²</dd>
                        </div>
                        <div>
                          <dt>Registered</dt>
                          <dd>{date(row.registration_date)}</dd>
                        </div>
                      </dl>
                      <button
                        className="button secondary"
                        disabled={detailLoading}
                        onClick={() => openDetail(row.id)}
                      >
                        View property <ArrowRight size={16} />
                      </button>
                    </article>
                  ))}
                </div>
                <div className="public-pagination">
                  <span>
                    {records.total.toLocaleString("en-IN")} matching properties
                    · Page {page} of{" "}
                    {Math.max(1, Math.ceil(records.total / records.limit))}
                  </span>
                  <div>
                    <button
                      className="button secondary"
                      disabled={page === 1}
                      aria-label="Previous page"
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      className="button secondary"
                      disabled={page * records.limit >= records.total}
                      aria-label="Next page"
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              !error && (
                <p className="public-empty">
                  No registered properties match this search.
                </p>
              )
            )}
          </div>
        </section>
        {detail && (
          <section
            className="public-detail"
            aria-labelledby="public-detail-title"
          >
            <div className="public-section-head">
              <div>
                <span className="eyebrow">REGISTERED PROPERTY</span>
                <h2 id="public-detail-title" tabIndex={-1} ref={detailHeading}>
                  {detail.survey_no}
                </h2>
              </div>
              <button
                className="button secondary"
                onClick={() => setDetail(null)}
              >
                Close details
              </button>
            </div>
            <dl>
              {[
                ["Property type", title(detail.property_type)],
                ["District", `${detail.district_name}, ${detail.state_name}`],
                ["Registration office", detail.office_name],
                ["Area", `${detail.area} m²`],
                ["Registration date", date(detail.registration_date)],
                ["Registration status", "Registered"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <p className="public-detail-note">
              This overview is for information. It is not an encumbrance
              certificate or proof of title.
            </p>
          </section>
        )}
        <footer className="public-footer">
          LandLedger · Public property portal · Basic registration information
        </footer>
      </main>
    </div>
  );
}
