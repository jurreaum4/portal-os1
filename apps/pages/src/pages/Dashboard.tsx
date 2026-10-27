import { getPipeline } from "../api/pipeline";
import { useState } from "react";
import { Link } from "react-router-dom";
import { getProducts } from "../api/products";
import { getApprovals } from "../api/approvals";
import {
  getDeployments,
  getHealth,
  getDivisions,
  getActivity,
  getRecommendations,
} from "../api/operations";
import { useApi } from "../hooks/useApi";
import { AsyncState } from "../components/AsyncState";
import { Icon } from "../components/Icon";
import { money } from "../types";
const divisionIcons = ["products", "analytics", "spark", "portfolio"];
export default function Dashboard() {
  const pipeline = useApi(getPipeline, 15000);
  const deployments = useApi(getDeployments, 15000);
  const products = useApi(getProducts, 15000),
    approvals = useApi(getApprovals, 15000),
    health = useApi(getHealth, 15000),
    divisions = useApi(getDivisions),
    activity = useApi(getActivity, 15000),
    recommendations = useApi(getRecommendations, 15000);
  const [division, setDivision] = useState("all");
  const rows = (products.data ?? []).filter(
    (p) => division === "all" || p.divisionId === division,
  );
  const pending = (approvals.data ?? []).filter((a) =>
    rows.some((p) => p.id === a.productId),
  );
  const score = rows.length
    ? Math.round(rows.reduce((s, p) => s + p.score, 0) / rows.length)
    : null;
  const published = rows.filter((p) =>
    ["Published", "Live"].includes(p.stage),
  ).length;
  const building = rows.filter((p) => p.stage === "Build").length;
  const reload = () => {
    deployments.reload();
    products.reload();
    approvals.reload();
    health.reload();
    activity.reload();
    recommendations.reload();
  };
  function exportSnapshot() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            division,
            products: rows,
            approvals: pending,
            health: health.data,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "portal-os1-snapshot.json";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <div className="page-heading command-heading">
        <div>
          <div className="eyebrow">
            <span className="tiny-line" />
            YOUR ECOSYSTEM, IN FOCUS
          </div>
          <h1>
            Mission control<span className="title-dot">.</span>
          </h1>
          <p>The big picture. Every division. One command centre.</p>
        </div>
        <div className="heading-actions">
          <button onClick={exportSnapshot} disabled={!products.data}>
            <Icon name="download" size={15} />
            Export overview
          </button>
          <Link className="button primary" to="/orchestration">
            <Icon name="plus" size={16} />
            New product
          </Link>
        </div>
      </div>
      <div className="dashboard-toolbar">
        <div className="overview-tabs">
          <span className="selected">Overview</span>
          <Link to="/governance">
            Governor console
            <Icon name="external" size={12} />
          </Link>
        </div>
        <div className="dashboard-filters">
          <span className="live-label">
            <span className="status-dot" />
            Live overview
          </span>
          <label className="division-select">
            <Icon name="globe" size={14} />
            <select
              aria-label="Filter dashboard by division"
              value={division}
              onChange={(e) => setDivision(e.target.value)}
            >
              <option value="all">All divisions</option>
              {divisions.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="icon-button"
            onClick={reload}
            aria-label="Refresh overview"
          >
            ↻
          </button>
        </div>
      </div>
      <AsyncState {...products} retry={products.reload} />
      <AsyncState {...approvals} retry={approvals.reload} />
      <AsyncState {...divisions} retry={divisions.reload} />
      <div className="command-metrics">
        {[
          {
            label: "Portfolio score",
            value: score ?? "—",
            suffix: "/100",
            icon: "portfolio",
            note: rows.length
              ? "Average across your portfolio"
              : "Awaiting product data",
            tag: "Portfolio health",
            color: "purple",
          },
          {
            label: "Total products",
            value: products.data ? rows.length : "—",
            suffix: "",
            icon: "products",
            note: `${published} published · ${rows.length - published} in development`,
            tag: "Across all stages",
            color: "blue",
          },
          {
            label: "Pending approvals",
            value: approvals.data ? pending.length : "—",
            suffix: "",
            icon: "approvals",
            note: `${pending.filter((a) => a.priority === "High").length} high priority decisions`,
            tag: "Needs your attention",
            color: "amber",
          },
          {
            label: "Monthly revenue",
            value: products.data
              ? money(rows.reduce((s, p) => s + p.revenue, 0))
              : "—",
            suffix: "",
            icon: "analytics",
            note: "Reported product revenue · USD",
            tag: "Portfolio total",
            color: "green",
          },
        ].map((m) => (
          <article className={`command-metric ${m.color}`} key={m.label}>
            <div className="metric-label">
              {m.label}
              <span className="metric-symbol">
                <Icon name={m.icon} size={17} />
              </span>
            </div>
            <strong>
              {m.value}
              <small>{m.suffix}</small>
            </strong>
            <p>
              <span className="metric-indicator" />
              {m.note}
            </p>
            <div className="metric-bottom">
              {m.tag}
              <Icon name="arrow" size={13} />
            </div>
          </article>
        ))}
      </div>
      <div className="command-grid">
        <div className="command-primary">
          <section className="panel divisions-panel">
            <div className="section-heading">
              <div>
                <h2>Division overview</h2>
                <p>Your divisions. One shared ambition.</p>
              </div>
              <Link to="/portfolio?view=organizations">
                View portfolio
                <Icon name="arrow" size={14} />
              </Link>
            </div>
            <div className="division-cards">
              {divisions.data
                ?.filter((d) => division === "all" || d.id === division)
                .map((d) => {
                  const i = divisions.data!.findIndex((row) => row.id === d.id);
                  const ps = rows.filter((p) => p.divisionId === d.id);
                  return (
                    <Link
                      to={`/portfolio?division=${encodeURIComponent(d.id)}`}
                      className="division-card"
                      key={d.id}
                      style={
                        { "--division-color": d.color } as React.CSSProperties
                      }
                    >
                      <div className="division-card-top">
                        <span className="division-icon">
                          <Icon name={divisionIcons[i % 4]} size={21} />
                        </span>
                        <Icon name="external" size={13} />
                      </div>
                      <h3>{d.name}</h3>
                      <span className="division-description">
                        {[
                          "Interactive experiences",
                          "Stories that move",
                          "Creativity without limits",
                          "Knowledge into impact",
                        ][i] ?? "A new horizon"}
                      </span>
                      <div className="division-product-count">
                        <strong>{ps.length}</strong> products{" "}
                        <span>
                          <i />
                          {
                            ps.filter((p) =>
                              ["Published", "Live"].includes(p.stage),
                            ).length
                          }{" "}
                          live
                        </span>
                      </div>
                      <div className="division-score">
                        <span>Portfolio score</span>
                        <b>
                          {ps.length
                            ? Math.round(
                                ps.reduce((s, p) => s + p.score, 0) / ps.length,
                              )
                            : "—"}
                        </b>
                      </div>
                      <div className="division-progress">
                        <span
                          style={{
                            width: `${ps.length ? ps.reduce((s, p) => s + p.score, 0) / ps.length : 0}%`,
                          }}
                        />
                      </div>
                    </Link>
                  );
                })}
            </div>
            <div className="division-footer">
              <span>
                <Icon name="globe" size={13} />
                Built to grow. Ready for your next division.
              </span>
              <Link to="/settings">
                Manage divisions
                <Icon name="arrow" size={13} />
              </Link>
            </div>
          </section>
          <section className="panel lifecycle-panel">
            <div className="section-heading">
              <div>
                <h2>Product pipeline</h2>
                <p>From the first spark to the next release.</p>
              </div>
              <Link to="/pipeline">
                Open pipeline
                <Icon name="arrow" size={14} />
              </Link>
            </div>
            <div className="pipeline-summary">
              <div>
                <span className="pipeline-big">
                  {
                    rows.filter(
                      (p) =>
                        !["Published", "Live", "Archived"].includes(p.stage),
                    ).length
                  }
                </span>
                <span>products moving forward</span>
              </div>
              <span className="subtle-badge">
                <span className="status-dot" />
                {building} in build
              </span>
            </div>
            <div className="lifecycle-bars">
              {(pipeline.data ?? [])
                .map((p) => p.stage)
                .map((s, i) => {
                  const n = rows.filter(
                    (p) =>
                      p.stage === s ||
                      (s === "Published" && p.stage === "Live") ||
                      (s === "Discovery" && p.stage === "Validation"),
                  ).length;
                  return (
                    <Link to="/pipeline" key={s}>
                      <span className="lifecycle-count">{n}</span>
                      <div
                        className={`lifecycle-bar ${n ? "has-products" : ""}`}
                        style={
                          {
                            height: `${18 + n * 22}px`,
                            "--bar-color": `hsl(${253 - i * 10} 55% ${61 - i}%)`,
                          } as React.CSSProperties
                        }
                      />
                      <span className="lifecycle-name">{s}</span>
                    </Link>
                  );
                })}
            </div>
            <div className="pipeline-note">
              <Icon name="spark" size={14} />
              <span>Ideas become products. Governance guides every step.</span>
              <Link to="/orchestration">Explore the factory →</Link>
            </div>
          </section>
          <section className="panel activity-panel">
            <div className="section-heading">
              <div>
                <h2>Recent activity</h2>
                <p>The latest across your ecosystem.</p>
              </div>
              <Link to="/governance">
                View governance
                <Icon name="arrow" size={14} />
              </Link>
            </div>
            <AsyncState {...activity} retry={activity.reload} />
            {activity.data
              ?.filter(
                (a) =>
                  division === "all" || rows.some((p) => p.id === a.productId),
              )
              .slice(0, 4)
              .map((a) => (
                <div className="activity-item" key={a.id}>
                  <span className={`activity-symbol ${a.kind}`}>
                    <Icon
                      name={a.kind === "warning" ? "health" : "check"}
                      size={14}
                    />
                  </span>
                  <div>
                    <Link
                      to={
                        a.productId
                          ? `/products/${encodeURIComponent(a.productId)}`
                          : "/governance"
                      }
                    >
                      {a.title}
                    </Link>
                    <span>
                      {a.department} department <b>·</b>{" "}
                      {new Date(
                        a.createdAt.replace(" ", "T") + "Z",
                      ).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <Icon name="chevron" size={14} />
                </div>
              ))}
            {activity.data?.length === 0 && (
              <p className="empty-copy">
                Your next product decision starts the activity feed.
              </p>
            )}
          </section>
        </div>
        <div className="command-secondary">
          <section className="panel health-panel">
            <div className="section-heading">
              <h2>System health</h2>
              <Link to="/runtime" aria-label="View runtime">
                <Icon name="external" size={14} />
              </Link>
            </div>
            <AsyncState {...health} retry={health.reload} />
            {health.data && (
              <>
                <div
                  className={`system-status ${health.data.status === "Attention" ? "attention" : ""}`}
                >
                  <span className="status-dot" />
                  {health.data.status === "Operational"
                    ? "Core systems operational"
                    : "System needs attention"}
                </div>
                <div className="health-services">
                  {health.data.services.map((s) => (
                    <div key={s.name}>
                      <span>{s.name}</span>
                      <span
                        className={
                          s.status === "Operational"
                            ? "service-ok"
                            : "service-neutral"
                        }
                      >
                        <i />
                        {s.status}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="health-foot">
                  <Icon name="clock" size={12} />
                  Checked{" "}
                  {new Date(health.data.sampledAt).toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  <span>15s refresh</span>
                </div>
              </>
            )}
          </section>
          <section className="panel deployment-panel">
            <div className="section-heading">
              <h2>Deployment status</h2>
              <Icon name="globe" size={15} />
            </div>
            <AsyncState {...deployments} retry={deployments.reload} />
            {deployments.data?.length === 0 && (
              <>
                <div className="deployment-empty">
                  <span className="activity-symbol">
                    <Icon name="code" size={15} />
                  </span>
                  <div>
                    <strong>Awaiting deployment reports</strong>
                    <p>
                      Connect a release integration to track deployments here.
                    </p>
                  </div>
                </div>
                <div className="release-status">
                  <span>{published} published products</span>
                  <Link to="/pipeline">View readiness →</Link>
                </div>
              </>
            )}
            {deployments.data?.slice(0, 3).map((d) => (
              <div className="stat-row" key={d.id}>
                <span>
                  {d.name} · {d.environment}
                </span>
                <span className="badge">{d.status}</span>
              </div>
            ))}
          </section>
          <section className="panel decisions-panel">
            <div className="section-heading">
              <h2>
                Approval queue{" "}
                <span className="count-pill">{pending.length}</span>
              </h2>
              <Icon name="approvals" size={17} />
            </div>
            {pending.slice(0, 3).map((a) => (
              <Link
                className="decision-preview"
                to={`/approvals?product=${encodeURIComponent(a.productId)}`}
                key={a.id}
              >
                <div>
                  <span className={`decision-dot ${a.risk.toLowerCase()}`} />
                  <strong>{a.project}</strong>
                  <Icon name="chevron" size={13} />
                </div>
                <p>{a.action}</p>
                <span className={`priority-tag ${a.priority.toLowerCase()}`}>
                  {a.priority} priority
                </span>
                <span className="decision-risk">{a.risk} risk</span>
              </Link>
            ))}
            {approvals.data && pending.length === 0 && (
              <p className="empty-copy">All clear. No decisions waiting.</p>
            )}
            <Link className="queue-link" to="/approvals">
              Review approvals
              <Icon name="arrow" size={14} />
            </Link>
          </section>
          <section className="intelligence-card">
            <div className="intelligence-label">
              <Icon name="spark" size={16} />
              PORTAL INTELLIGENCE
            </div>
            <h2>Your next best move.</h2>
            <AsyncState {...recommendations} retry={recommendations.reload} />
            <p>
              {recommendations.data?.filter((r) =>
                rows.some((p) => p.id === r.productId),
              )[0]?.reason ??
                "Bring your next idea into the portfolio and turn possibility into progress."}
            </p>
            <Link to="/analytics">
              Explore insights
              <Icon name="arrow" size={15} />
            </Link>
            <div className="orbital-art" aria-hidden="true">
              <i />
              <i />
              <i />
              <span>✦</span>
            </div>
          </section>
        </div>
      </div>
      <div className="dashboard-bottom">
        <span>
          <span className="status-dot" />
          One ecosystem. Always moving forward.
        </span>
        <span>
          PORTAL–OS1 <b> / </b> MAX ECOSYSTEM
        </span>
      </div>
    </>
  );
}
