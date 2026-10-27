import { useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { DivisionCentre as Data } from "../api/universe";
import { useApi } from "../hooks/useApi";
import { AsyncState } from "../components/AsyncState";
import { money } from "../types";
export default function DivisionCentre() {
  const { id } = useParams();
  const load = useCallback(
    (signal: AbortSignal) =>
      api<Data>(
        `/api/divisions/${encodeURIComponent(id ?? "")}/command-centre`,
        { signal },
      ),
    [id],
  );
  const state = useApi(load, 15000);
  const d = state.data;
  return (
    <>
      <Link to="/portal/ecosystem">← MAX Universe</Link>
      <div className="page-heading">
        <div>
          <div className="eyebrow">DIVISION COMMAND CENTRE</div>
          <h1>{d?.division.name ?? "Division"}</h1>
          <p>Revenue, products, dependencies and operational signals.</p>
        </div>
      </div>
      <AsyncState {...state} retry={state.reload} />
      {d && (
        <>
          <div className="portfolio-summary">
            <div>
              <strong>{d.division.health}</strong>
              <span>Current risk signals</span>
            </div>
            <div>
              <strong>{money(d.division.revenue)}</strong>
              <span>Reported monthly revenue · USD</span>
            </div>
            <div>
              <strong>
                {d.division.observedGrowthPct === null
                  ? "—"
                  : `${d.division.observedGrowthPct}%`}
              </strong>
              <span>Observed revenue change</span>
            </div>
          </div>
          <div className="analytics-grid">
            <section className="panel">
              <h2>Products</h2>
              {d.products.map((p) => (
                <Link
                  key={p.id}
                  className="stat-row"
                  to={`/portal/products/${encodeURIComponent(p.id)}/twin`}
                >
                  <strong>{p.name}</strong>
                  <span>
                    {p.stage} · {p.status} ↗
                  </span>
                </Link>
              ))}
              {!d.products.length && (
                <p>No products assigned to this division.</p>
              )}
            </section>
            <section className="panel">
              <h2>Recommendations</h2>
              {d.division.recommendations.map((r, i) => (
                <Link
                  className="queue-preview"
                  key={i}
                  to={`/portal/products/${encodeURIComponent(r.productId)}/twin`}
                >
                  <div>
                    <strong>{r.name}</strong>
                    <span>{r.reason}</span>
                  </div>
                </Link>
              ))}
              {!d.division.recommendations.length && (
                <p>No current recommendations.</p>
              )}
              <h3>Forecast · flat reported revenue baseline</h3>
              <strong>{money(d.division.forecastMonthlyUsd)} / month</strong>
              <p className="muted">No unobserved growth is assumed.</p>
            </section>
          </div>
          <section className="panel">
            <h2>Dependencies & relationships</h2>
            {d.dependencies.map((r) => (
              <div className="stat-row" key={r.id}>
                <Link
                  to={`/portal/products/${encodeURIComponent(r.sourceId)}/twin`}
                >
                  {r.sourceId}
                </Link>
                <span>{r.relation.replaceAll("_", " ")} →</span>
                <Link
                  to={`/portal/products/${encodeURIComponent(r.targetId)}/twin`}
                >
                  {r.targetId}
                </Link>
              </div>
            ))}
            {!d.dependencies.length && (
              <p>No relationships have been supplied by integrations.</p>
            )}
          </section>
        </>
      )}
    </>
  );
}
