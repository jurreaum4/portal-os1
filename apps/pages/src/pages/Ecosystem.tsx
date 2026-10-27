import { SystemStatus } from "../components/SystemStatus";
import { Link } from "react-router-dom";
import { getEcosystem } from "../api/universe";
import { useApi } from "../hooks/useApi";
import { AsyncState } from "../components/AsyncState";
import { RefreshControl } from "../components/RefreshControl";
import {
  UniverseSummary,
  UniverseSignals,
} from "../components/UniverseSummary";
import { money } from "../types";
export default function Ecosystem() {
  const state = useApi(getEcosystem, 15000);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ECOSYSTEM COMMAND CENTRE</div>
          <h1>
            MAX Universe<span className="title-dot">.</span>
          </h1>
          <p>Your divisions. Their momentum. One executive view.</p>
        </div>
        <RefreshControl {...state} />
      </div>
      <AsyncState {...state} retry={state.reload} />
      {state.data && (
        <>
          <UniverseSummary data={state.data} />
          <section
            aria-label="Division command centres"
            className="universe-divisions"
          >
            {state.data.divisions.map((d) => (
              <Link
                className="panel universe-division"
                key={d.id}
                to={`/portal/divisions/${encodeURIComponent(d.id)}`}
              >
                <span className="eyebrow">DIVISION COMMAND CENTRE ↗</span>
                <h2>{d.name}</h2>
                <span className="badge">{d.health}</span>
                <div className="stat-row">
                  <span>Products</span>
                  <strong>{d.products}</strong>
                </div>
                <div className="stat-row">
                  <span>Monthly USD · reported</span>
                  <strong>{money(d.revenue)}</strong>
                </div>
                <div className="stat-row">
                  <span>Revenue growth</span>
                  <strong>
                    {d.observedGrowthPct === null
                      ? "Awaiting history"
                      : `${d.observedGrowthPct}%`}
                  </strong>
                </div>
              </Link>
            ))}
          </section>
          <UniverseSignals data={state.data} />
          <SystemStatus />
          <section className="panel">
            <h2>Product status</h2>
            {state.data.products.length ? (
              state.data.products.map((p) => (
                <Link
                  className="stat-row"
                  key={p.id}
                  to={`/portal/products/${encodeURIComponent(p.id)}/twin`}
                >
                  <strong>{p.name}</strong>
                  <span>
                    {p.stage} · {p.status} ↗
                  </span>
                </Link>
              ))
            ) : (
              <p>
                No products recorded yet. Automated intake feeds the product
                factory.
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}
