import { useState } from "react";
import { Link } from "react-router-dom";
import { getEcosystem } from "../api/universe";
import { useApi } from "../hooks/useApi";
import { AsyncState } from "../components/AsyncState";
import { money } from "../types";
export default function Intelligence() {
  const state = useApi(getEcosystem, 15000);
  const [view, setView] = useState<
    | "product"
    | "revenue"
    | "growth"
    | "risk"
    | "health"
    | "division"
    | "divisionRevenue"
    | "divisionGrowth"
  >("product");
  const [mode, setMode] = useState("matrix");
  const d = state.data;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PORTAL INTELLIGENCE V2</div>
          <h1>
            Signals into decisions<span className="title-dot">.</span>
          </h1>
          <p>Portfolio rankings, risks, opportunities and evidence.</p>
        </div>
      </div>
      <AsyncState {...state} retry={state.reload} />
      {d && (
        <>
          <div className="filter-toolbar">
            <label>
              Rank by
              <select
                value={view}
                onChange={(e) => setView(e.target.value as typeof view)}
              >
                {[
                  ["product", "Product score"],
                  ["revenue", "Reported revenue"],
                  ["growth", "Revenue growth"],
                  ["risk", "Risk flags"],
                  ["health", "Observed health"],
                  ["division", "Division score"],
                  ["divisionRevenue", "Division revenue"],
                  ["divisionGrowth", "Division growth"],
                ].map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Portfolio view
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="matrix">Portfolio matrix</option>
                <option value="heatmap">Risk heatmap</option>
                <option value="opportunity">Opportunities & promotion</option>
                <option value="archive">Archive review</option>
              </select>
            </label>
            <Link to="/portal/twin">Dependency graph ↗</Link>
          </div>
          <div className="analytics-grid">
            <section className="panel">
              <h2>Rankings</h2>
              {d.rankings[view].map((r) => (
                <Link
                  key={r.id}
                  className="stat-row"
                  to={
                    view.startsWith("division")
                      ? `/portal/divisions/${encodeURIComponent(r.id)}`
                      : `/portal/products/${encodeURIComponent(r.id)}/twin`
                  }
                >
                  <span>
                    {r.rank}. {r.name}
                  </span>
                  <strong>
                    {view === "revenue" || view === "divisionRevenue"
                      ? money(r.value)
                      : `${r.value}${view === "growth" || view === "divisionGrowth" ? "%" : ""}`}
                  </strong>
                </Link>
              ))}
              {!d.rankings[view].length && (
                <p>No qualifying observations yet.</p>
              )}
            </section>
            <section className="panel">
              <h2>How to read these signals</h2>
              {Object.entries(d.methods).map(([key, value]) => (
                <div key={key}>
                  <h3>{key.charAt(0).toUpperCase() + key.slice(1)}</h3>
                  <p className="muted">{value}</p>
                </div>
              ))}
              <p>
                Promotion and archive candidates are review suggestions. They do
                not change product state or bypass approval.
              </p>
            </section>
          </div>
          <section className="panel">
            <h2>
              {mode === "matrix"
                ? "Portfolio matrix"
                : mode === "heatmap"
                  ? "Risk heatmap"
                  : mode === "archive"
                    ? "Archive review"
                    : "Opportunities & promotion"}
            </h2>
            <div
              className={
                mode === "heatmap" ? "universe-heatmap" : "universe-matrix"
              }
            >
              {d.products
                .filter((p) =>
                  mode === "opportunity"
                    ? p.promotionCandidate
                    : mode === "archive"
                      ? p.archiveCandidate
                      : true,
                )
                .map((p) => (
                  <Link
                    key={p.id}
                    className={`universe-cell ${p.risk > 0 ? "has-risk" : ""}`}
                    to={`/portal/products/${encodeURIComponent(p.id)}/twin`}
                  >
                    <strong>{p.name}</strong>
                    <span>
                      {p.stage} · score {p.score}
                    </span>
                    <span>
                      Risk {p.risk}/100 · observed health{" "}
                      {p.health ?? "unknown"}
                    </span>
                    <span>{p.nextBestAction}</span>
                  </Link>
                ))}
            </div>
            {!d.products.length && <p>No products to analyse yet.</p>}
          </section>
        </>
      )}
    </>
  );
}
