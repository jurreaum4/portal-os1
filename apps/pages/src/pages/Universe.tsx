import { useCallback, useMemo, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { api } from "../api/client";
import { useGovernor } from "../layouts/GovernorLayout";
import { useApi } from "../hooks/useApi";
import { AsyncState } from "../components/AsyncState";
import { money } from "../types";
import type {
  Universe as UniverseData,
  Twin,
} from "../../../worker/src/universe/model";
import Approvals from "./Approvals";
import "./Universe.css";

const views = [
  ["", "Overview"],
  ["galaxy", "Galaxy"],
  ["products", "Constellation"],
  ["pipeline", "Pipeline"],
  ["departments", "Departments"],
  ["sports", "MAX Sports"],
  ["marketplace", "Marketplace"],
  ["quantum", "Quantum XR"],
];
const number = (v: number | null | undefined) =>
  v == null
    ? "Not observed"
    : new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 1,
        notation: Math.abs(v) >= 10000 ? "compact" : "standard",
      }).format(v);
const color = (n: Twin, mode: string) =>
  mode === "risk"
    ? n.risk === "High"
      ? "#fb967d"
      : n.risk === "Low"
        ? "#70d9aa"
        : "#8292a9"
    : mode === "status"
      ? n.status === "blocked" || n.status === "Attention"
        ? "#fb967d"
        : n.status === "completed" || n.stage === "Published"
          ? "#70d9aa"
          : "#8ca7f8"
      : n.health === null
        ? "#8292a9"
        : n.health >= 80
          ? "#70d9aa"
          : n.health >= 50
            ? "#edc782"
            : "#fb967d";
function Trend({ node }: { node: Twin }) {
  const values = node.history
    .map((h) => (node.kind === "department" ? h.health : h.revenue))
    .filter((v): v is number => v !== null);
  if (values.length < 2)
    return (
      <span className="u-muted">
        History collecting · {values.length} daily sample(s)
      </span>
    );
  const max = Math.max(...values, 1);
  return (
    <svg
      viewBox="0 0 160 35"
      className="u-trend"
      role="img"
      aria-label={`${node.name} ${node.kind === "department" ? "health" : "revenue"} history, ${values.length} samples`}
    >
      <polyline
        points={values
          .map(
            (v, i) =>
              `${(i * 160) / (values.length - 1)},${32 - (v / max) * 28}`,
          )
          .join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}
export default function Universe() {
  const location = useLocation();
  const governor = location.pathname === "/portal/governor";
  const view = governor ? "governor" : (location.pathname.split("/")[3] ?? "");
  const { token } = useGovernor();
  const load = useCallback(
    (signal: AbortSignal) =>
      api<UniverseData>("/api/universe", {
        signal,
        headers: { Authorization: `Bearer ${token}` },
      }),
    [token],
  );
  const state = useApi(load, 15000);
  const [sportsModule, setSportsModule] = useState("all");
  const [query, setQuery] = useState(""),
    [division, setDivision] = useState("all"),
    [size, setSize] = useState("revenue"),
    [colorMode, setColorMode] = useState("health"),
    [selected, setSelected] = useState<string | null>(null),
    [zoom, setZoom] = useState(1);
  const data = state.data;
  const divisions =
    data?.nodes.filter(
      (n) => n.kind === "division" && n.parentId === "ecosystem:max",
    ) ?? [];
  const visible = useMemo(() => {
    if (!data) return [];
    let nodes = data.nodes;
    if (view === "sports" || view === "quantum" || division !== "all") {
      const ids = new Set(
        nodes
          .filter((n) =>
            division !== "all"
              ? n.id === division
              : n.category === (view === "sports" ? "sports" : "xr"),
          )
          .map((n) => n.id),
      );
      let changed = true;
      while (changed) {
        changed = false;
        for (const n of nodes)
          if (n.parentId && ids.has(n.parentId) && !ids.has(n.id)) {
            ids.add(n.id);
            changed = true;
          }
      }
      nodes = nodes.filter((n) => ids.has(n.id));
    }
    if (view === "products")
      nodes = nodes.filter((n) =>
        ["product", "asset", "service", "runtime", "creator"].includes(n.kind),
      );
    else if (view !== "departments")
      nodes = nodes.filter((n) => n.kind !== "department");
    return nodes.filter(
      (n) => !query || n.name.toLowerCase().includes(query.toLowerCase()),
    );
  }, [data, view, division, query]);
  const chosen = data?.nodes.find((n) => n.id === selected);
  const title = governor
    ? "Governor console"
    : (views.find(([id]) => id === view)?.[1] ?? "MAX Universe");
  const graphView =
    ["", "galaxy", "products", "sports", "quantum"].includes(view) && !governor;
  return (
    <div className="universe-page">
      <header className="u-heading">
        <div>
          <div className="eyebrow">PORTAL-OS1 / MAX UNIVERSE</div>
          <h1>
            {title}
            <span className="title-dot">.</span>
          </h1>
          <p>The ecosystem, connected. Every signal has a source.</p>
        </div>
        <div className="u-live">
          <i />
          {data
            ? `Observed ${new Date(data.sampledAt).toLocaleTimeString()}`
            : "Awaiting access"}
        </div>
      </header>
      <nav className="u-tabs" aria-label="Universe views">
        {views.map(([id, label]) => (
          <NavLink key={id} end to={`/portal/universe${id ? `/${id}` : ""}`}>
            {label}
          </NavLink>
        ))}
        <NavLink to="/portal/governor">Governor</NavLink>
      </nav>
      {!token && (
        <p className="notice">
          Connect a viewer or governor credential in{" "}
          <Link to="/settings">Settings</Link> to access the Universe.
          Automation credentials are reserved for integrations.
        </p>
      )}
      <AsyncState {...state} retry={state.reload} />
      {data && (
        <>
          <section className="u-metrics" aria-label="Ecosystem summary">
            {[
              [
                "Ecosystem health",
                data.summary.health === null
                  ? "Not observed"
                  : `${number(data.summary.health)}%`,
              ],
              ["Monthly revenue", money(data.summary.revenue)],
              ["Connected divisions", data.summary.divisions],
              [
                "Products / projects",
                `${data.summary.products} / ${data.summary.projects}`,
              ],
              ["Risk signals", data.summary.risks],
              ["Governor queue", data.summary.approvals],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </section>
          {graphView && (
            <>
              <div className="u-toolbar">
                <label>
                  Find a node
                  <input
                    aria-label="Find a Universe node"
                    placeholder="Search the ecosystem"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <label>
                  Division
                  <select
                    value={division}
                    onChange={(e) => setDivision(e.target.value)}
                  >
                    <option value="all">All divisions</option>
                    {divisions.map((d) => (
                      <option value={d.id} key={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Node size
                  <select
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                  >
                    <option value="revenue">Revenue</option>
                    <option value="users">Users</option>
                    <option value="impact">Impact</option>
                  </select>
                </label>
                <label>
                  Node color
                  <select
                    value={colorMode}
                    onChange={(e) => setColorMode(e.target.value)}
                  >
                    <option value="health">Health</option>
                    <option value="risk">Risk</option>
                    <option value="status">Operational status</option>
                  </select>
                </label>
              </div>
              <section
                className="u-galaxy"
                aria-label="Interactive ecosystem graph"
              >
                <div className="u-map-title">
                  <span>
                    MAX /{" "}
                    {view === "products"
                      ? "PRODUCT CONSTELLATION"
                      : "ECOSYSTEM GALAXY"}
                  </span>
                  <span>
                    {visible.length} nodes ·{" "}
                    {
                      data.relationships.filter(
                        (r) =>
                          visible.some((n) => n.id === r.from) &&
                          visible.some((n) => n.id === r.to),
                      ).length
                    }{" "}
                    connections
                  </span>
                </div>
                <div className="u-map-scroll">
                  <svg
                    className="u-map"
                    viewBox="-450 -300 900 600"
                    role="group"
                    aria-label="Select a planet or orbiting node to inspect its digital twin"
                    style={{ width: `${zoom * 100}%`, minWidth: "600px" }}
                  >
                    <defs>
                      <radialGradient id="u-glow">
                        <stop
                          offset="0"
                          stopColor="#4d70aa"
                          stopOpacity=".28"
                        />
                        <stop offset="1" stopColor="#4d70aa" stopOpacity="0" />
                      </radialGradient>
                    </defs>
                    <circle r="280" fill="url(#u-glow)" />
                    {[120, 220, 285].map((r) => (
                      <ellipse
                        key={r}
                        rx={r * 1.3}
                        ry={r * 0.86}
                        fill="none"
                        stroke="#263650"
                        strokeDasharray="3 8"
                      />
                    ))}
                    {data.relationships.map((r) => {
                      const a = visible.find((n) => n.id === r.from),
                        b = visible.find((n) => n.id === r.to);
                      return a && b ? (
                        <line
                          key={r.id}
                          x1={a.position.x * 26}
                          y1={a.position.z * 19}
                          x2={b.position.x * 26}
                          y2={b.position.z * 19}
                          stroke={r.type === "contains" ? "#30455e" : "#a692e8"}
                          strokeWidth={r.type === "contains" ? 1 : 2}
                          strokeDasharray={
                            r.type === "contains" ? undefined : "4 3"
                          }
                        >
                          <title>{r.type}</title>
                        </line>
                      ) : null;
                    })}
                    {visible.map((n) => {
                      const value =
                        size === "users"
                          ? n.users
                          : size === "impact"
                            ? n.impact
                            : n.revenue;
                      const radius =
                        (n.kind === "ecosystem"
                          ? 23
                          : n.kind === "division" &&
                              n.parentId === "ecosystem:max"
                            ? 15
                            : 7) +
                        Math.min(14, Math.log10(1 + (value ?? 0)) * 2);
                      return (
                        <g
                          key={n.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`Inspect ${n.name}, ${n.status}`}
                          onClick={() => setSelected(n.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelected(n.id);
                            }
                          }}
                          className="u-node"
                          transform={`translate(${n.position.x * 26} ${n.position.z * 19})`}
                        >
                          <circle
                            r={radius + 6}
                            fill="none"
                            stroke={color(n, colorMode)}
                            opacity={selected === n.id ? 1 : 0.2}
                          />
                          <circle
                            r={radius}
                            fill={color(n, colorMode)}
                            fillOpacity=".18"
                            stroke={color(n, colorMode)}
                            strokeWidth="1.5"
                          />
                          <circle r="3" fill={color(n, colorMode)} />
                          <text
                            y={radius + 19}
                            textAnchor="middle"
                            fill="#e3edf9"
                            opacity={
                              n.parentId === "ecosystem:max" ||
                              n.kind === "ecosystem" ||
                              selected === n.id ||
                              zoom > 1.5
                                ? 1
                                : 0
                            }
                            fontSize={n.kind === "division" ? 11 : 9}
                          >
                            {n.name.length > 27
                              ? `${n.name.slice(0, 25)}…`
                              : n.name}
                          </text>
                          <title>
                            {n.name} · {n.status} ·{" "}
                            {value === null
                              ? "Metric not observed"
                              : `${size}: ${number(value)}`}
                          </title>
                        </g>
                      );
                    })}
                  </svg>
                </div>
                <div className="u-map-footer">
                  <span>
                    <i className="u-dot good" />
                    Healthy / low risk <i className="u-dot risk" />
                    Attention <i className="u-dot unknown" />
                    Unknown · minimum size means no metric
                  </span>
                  <label>
                    Zoom{" "}
                    <input
                      aria-label="Graph zoom"
                      type="range"
                      min="1"
                      max="2.5"
                      step=".25"
                      value={zoom}
                      onChange={(e) => setZoom(Number(e.target.value))}
                    />
                  </label>
                </div>
              </section>
              <div className="u-node-index" aria-label="Accessible node list">
                {visible.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => setSelected(n.id)}
                    aria-pressed={selected === n.id}
                  >
                    {n.name}
                  </button>
                ))}
                {!visible.length && (
                  <p>
                    No matching entities. Connected records will appear
                    automatically.
                  </p>
                )}
              </div>
              {chosen && (
                <section className="panel u-twin">
                  <div>
                    <span className="eyebrow">
                      DIGITAL TWIN / {chosen.kind}
                    </span>
                    <h2>{chosen.name}</h2>
                    <p>
                      {chosen.status} · Risk: {chosen.risk}
                    </p>
                  </div>
                  <dl>
                    <div>
                      <dt>Lifecycle</dt>
                      <dd>{chosen.stage ?? "Not applicable"}</dd>
                    </div>
                    <div>
                      <dt>Monthly revenue</dt>
                      <dd>
                        {chosen.revenue === null
                          ? "Not observed"
                          : money(chosen.revenue)}
                      </dd>
                    </div>
                    <div>
                      <dt>Users / impact</dt>
                      <dd>
                        {number(chosen.users)} / {number(chosen.impact)}
                      </dd>
                    </div>
                    <div>
                      <dt>Growth vs last sample</dt>
                      <dd>
                        {chosen.growth === null
                          ? "Collecting history"
                          : `${number(chosen.growth)}%`}
                      </dd>
                    </div>
                    <div>
                      <dt>Dependencies</dt>
                      <dd>
                        {chosen.dependencies.length
                          ? chosen.dependencies
                              .map(
                                (id) =>
                                  data.nodes.find((n) => n.id === id)?.name ??
                                  id,
                              )
                              .join(", ")
                          : "None recorded"}
                      </dd>
                    </div>
                    <div>
                      <dt>Source</dt>
                      <dd>{chosen.source}</dd>
                    </div>
                  </dl>
                  <div className="u-stats">
                    {Object.entries(chosen.metrics).map(([metric, value]) => (
                      <div key={metric}>
                        <small>{metric}</small>
                        <p>{number(value)}</p>
                      </div>
                    ))}
                  </div>
                  <Trend node={chosen} />
                  {chosen.kind === "product" && (
                    <Link
                      to={`/products/${encodeURIComponent(chosen.id.slice(8))}`}
                    >
                      Open product and audit history →
                    </Link>
                  )}
                </section>
              )}
            </>
          )}
          {view === "pipeline" && (
            <section className="u-stage-grid">
              {data.pipeline.map((p) => (
                <article className="panel" key={p.stage}>
                  <span className="eyebrow">{p.stage}</span>
                  <strong className="u-big">{p.queue}</strong>
                  <p>Queued · {p.blocked} flagged</p>
                  <div className="u-bar">
                    <span
                      style={{
                        width: `${Math.min(100, (p.queue / Math.max(1, data.summary.products)) * 100)}%`,
                      }}
                    />
                  </div>
                  <p className="u-muted">
                    Mean stage time: {number(p.averageHours)}
                    {p.averageHours !== null ? " hours" : ""}
                    <br />
                    Queue estimate: {number(p.completionHours)}
                    {p.completionHours !== null ? " hours" : ""}
                    <br />
                    {p.samples} observed completions
                  </p>
                </article>
              ))}
            </section>
          )}
          {view === "departments" && (
            <section className="u-card-grid">
              {data.departments.map((d) => (
                <article className="panel" key={d.id}>
                  <div className="eyebrow">{d.id}</div>
                  <h2>{d.name}</h2>
                  <span className="badge">{d.health}</span>
                  <dl className="u-stats">
                    <div>
                      <dt>Capacity</dt>
                      <dd>{number(d.capacity)}</dd>
                    </div>
                    <div>
                      <dt>Workload / backlog</dt>
                      <dd>
                        {d.workload} / {d.backlog}
                      </dd>
                    </div>
                    <div>
                      <dt>Completed projects</dt>
                      <dd>{d.completed}</dd>
                    </div>
                    <div>
                      <dt>Queue estimate (hours)</dt>
                      <dd>{number(d.forecastHours)}</dd>
                    </div>
                  </dl>
                  <p>
                    {d.capacity !== null && d.backlog > 0
                      ? "Rebalance capacity before accepting additional work."
                      : d.capacity === null
                        ? "Connect capacity telemetry to assess utilization."
                        : "Recorded capacity covers the current queue."}
                  </p>
                  {data.nodes.find((n) => n.id === `department:${d.id}`) && (
                    <Trend
                      node={data.nodes.find(
                        (n) => n.id === `department:${d.id}`,
                      )!}
                    />
                  )}
                </article>
              ))}
            </section>
          )}
          {view === "sports" && (
            <section className="panel">
              <div className="eyebrow">MAX SPORTS / INTELLIGENCE ROOMS</div>
              <h2>Every discipline. One connected view.</h2>
              <div className="u-card-grid">
                {data.modules
                  .filter((m) => m.category === "sports")
                  .map((m) => (
                    <article key={m.id}>
                      <h3>
                        <button
                          className="u-module"
                          aria-pressed={sportsModule === m.id}
                          onClick={() =>
                            setSportsModule(
                              sportsModule === m.id ? "all" : m.id,
                            )
                          }
                        >
                          {m.name}
                        </button>
                      </h3>
                      <p className="u-muted">
                        Source-linked observations appear on athlete, team and
                        division twins.
                      </p>
                    </article>
                  ))}
              </div>
              <div className="u-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Entity</th>
                      <th>Type</th>
                      <th>Observed metrics</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible
                      .filter(
                        (n) =>
                          ["athlete", "team"].includes(n.kind) &&
                          (sportsModule === "all" ||
                            n.modules.includes(sportsModule)),
                      )
                      .map((n) => (
                        <tr key={n.id}>
                          <td>{n.name}</td>
                          <td>{n.kind}</td>
                          <td>
                            {Object.entries(n.metrics)
                              .map(([key, value]) => `${key}: ${number(value)}`)
                              .join(" · ") || "Not observed"}
                          </td>
                          <td>{n.source}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {!visible.some((n) => ["athlete", "team"].includes(n.kind)) && (
                <p>No athlete or team observations connected.</p>
              )}
            </section>
          )}
          {view === "marketplace" && (
            <section className="panel">
              <div className="eyebrow">MARKETPLACE UNIVERSE</div>
              <h2>Products, creators and revenue flow</h2>
              <p className="u-muted">
                Sales, downloads and engagement are source observations. Product
                monthly revenue is not added to marketplace sales.
              </p>
              <div className="u-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Product / creator</th>
                      <th>Revenue</th>
                      <th>Sales</th>
                      <th>Downloads</th>
                      <th>Engagement</th>
                      <th>Health</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.nodes
                      .filter((n) => ["product", "creator"].includes(n.kind))
                      .map((n) => (
                        <tr key={n.id}>
                          <td>{n.name}</td>
                          <td>
                            {n.revenue === null
                              ? "Not observed"
                              : money(n.revenue)}
                          </td>
                          <td>{number(n.metrics.sales)}</td>
                          <td>{number(n.metrics.downloads)}</td>
                          <td>{number(n.metrics.engagement)}</td>
                          <td>{number(n.health)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {!data.nodes.some((n) =>
                ["product", "creator"].includes(n.kind),
              ) && <p>No marketplace products or creators connected.</p>}
            </section>
          )}
          {(view === "" || view === "products" || governor) && (
            <div className="u-two-columns">
              <section className="panel">
                <div className="eyebrow">PORTFOLIO INTELLIGENCE</div>
                <h2>Signals worth your attention</h2>
                {data.recommendations.map((r) => (
                  <Link
                    className="u-signal"
                    key={r.id}
                    to={`/products/${encodeURIComponent(r.productId)}`}
                  >
                    <strong>
                      {r.name} <span className="badge">{r.priority}</span>
                    </strong>
                    <p>{r.reason}</p>
                  </Link>
                ))}
                {!data.recommendations.length && (
                  <p className="u-muted">
                    No recommendations from current product records.
                  </p>
                )}
                <h3>Opportunities</h3>
                {data.opportunities.map((o) => (
                  <p key={o.entityId}>
                    {data.nodes.find((n) => n.id === o.entityId)?.name}:{" "}
                    {o.reason}
                  </p>
                ))}
                {!data.opportunities.length && (
                  <p className="u-muted">
                    No evidence-backed opportunities yet.
                  </p>
                )}
              </section>
              <section className="panel">
                <div className="eyebrow">DIVISION INTELLIGENCE</div>
                <h2>Revenue & trajectory</h2>
                {divisions.map((d) => (
                  <div className="u-division-row" key={d.id}>
                    <strong>{d.name}</strong>
                    <span>{money(d.revenue ?? 0)}</span>
                    <small>
                      {d.forecast
                        ? `Scenario: ${money(d.forecast.conservative)} – ${money(d.forecast.optimistic)}`
                        : "Scenario unavailable"}
                    </small>
                    <Trend node={d} />
                  </div>
                ))}
              </section>
            </div>
          )}
          {view === "products" && (
            <section className="panel">
              <h2>Product rankings</h2>
              {visible
                .filter((n) => n.kind === "product")
                .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
                .map((n, i) => (
                  <div className="u-division-row" key={n.id}>
                    <strong>
                      {i + 1}. {n.name}
                    </strong>
                    <span>
                      {n.score} / 100 · {n.stage}
                    </span>
                    <small>Lifecycle evidence score · Risk {n.risk}</small>
                  </div>
                ))}
            </section>
          )}
          {(governor || view === "") && (
            <section className="panel">
              <h2>Universe status</h2>
              <div className="u-card-grid">
                {data.integrations.map((i) => (
                  <article key={i.id}>
                    <h3>{i.id}</h3>
                    <span className="badge">{i.status}</span>
                    <p>{i.detail}</p>
                  </article>
                ))}
              </div>
              <Link to="/portal/governor">Open Governor console →</Link>
            </section>
          )}
          {governor && (
            <>
              <section className="panel">
                <h2>Risks</h2>
                {data.nodes
                  .filter((n) => n.risk === "High")
                  .map((n) => (
                    <p key={n.id}>
                      {n.name} · {n.status}
                    </p>
                  ))}
                {!data.summary.risks && <p>No recorded high-risk signals.</p>}
              </section>
              {data.access?.canDecide ? (
                <Approvals />
              ) : (
                <p className="notice">
                  Viewer access: {data.summary.approvals} pending decisions.
                  Connect a governor credential in Settings to approve, reject
                  or override.
                </p>
              )}
            </>
          )}
          <details className="panel u-method">
            <summary>Sources, forecasts and spatial model</summary>
            {data.methodology.map((m) => (
              <p key={m}>{m}</p>
            ))}
            <p>
              XR-ready topology is available through the authenticated spatial
              API. Coordinates and relationships are independent of a rendering
              platform.
            </p>
          </details>
        </>
      )}
    </div>
  );
}
