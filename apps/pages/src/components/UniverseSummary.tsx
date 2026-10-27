import { Link } from "react-router-dom";
import type { Ecosystem } from "../api/universe";
import { money } from "../types";
export function UniverseSummary({ data }: { data: Ecosystem }) {
  const s = data.summary;
  return (
    <>
      <section className="universe-hero">
        <div className="eyebrow">MAX UNIVERSE · LIVE PROJECTIONS</div>
        <h2>One ecosystem. Every signal.</h2>
        <p>
          {s.ecosystemHealth} · {s.divisions} divisions · {s.products} products
        </p>
        <Link to="/portal/twin">Explore the ecosystem graph ↗</Link>
      </section>
      <div className="portfolio-summary universe-summary">
        <div>
          <strong>
            {s.portfolioScore ?? "—"}
            <small>/100</small>
          </strong>
          <span>Portfolio score</span>
        </div>
        <div>
          <strong>{money(s.reportedMonthlyUsd)}</strong>
          <span>Reported monthly revenue · USD</span>
        </div>
        <div>
          <strong>
            {s.observedGrowthPct === null ? "—" : `${s.observedGrowthPct}%`}
          </strong>
          <span>Revenue change · ≥7 day baseline</span>
        </div>
        <div>
          <strong>{s.riskProducts}</strong>
          <span>Products with risk flags</span>
        </div>
      </div>
    </>
  );
}
export function UniverseSignals({ data }: { data: Ecosystem }) {
  return (
    <div className="analytics-grid">
      <section className="panel">
        <h2>Risks & alerts</h2>
        {data.alerts.length ? (
          data.alerts.map((a, i) => (
            <Link
              className="queue-preview"
              key={`${a.productId}:${i}`}
              to={`/portal/products/${encodeURIComponent(a.productId)}/twin`}
            >
              <div>
                <strong>{a.name}</strong>
                <span>{a.reason}</span>
              </div>
              <span>↗</span>
            </Link>
          ))
        ) : (
          <p className="muted">No current product risk flags.</p>
        )}
      </section>
      <section className="panel">
        <h2>Next best action</h2>
        <p>{data.nextBestAction}</p>
        <h3>Forecast baseline</h3>
        <strong>{money(data.summary.reportedMonthlyUsd)} / month</strong>
        <p className="muted">{data.methods.forecast}</p>
        <Link to="/portal/intelligence">
          Review rankings, opportunities & assumptions ↗
        </Link>
      </section>
    </div>
  );
}
