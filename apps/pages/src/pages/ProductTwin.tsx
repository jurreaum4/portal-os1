import { useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Twin } from "../api/universe";
import { useApi } from "../hooks/useApi";
import { AsyncState } from "../components/AsyncState";
import { money } from "../types";
export default function ProductTwin() {
  const { id } = useParams();
  const load = useCallback(
    (signal: AbortSignal) =>
      api<Twin>(`/api/twin/products/${encodeURIComponent(id ?? "")}`, {
        signal,
      }),
    [id],
  );
  const state = useApi(load, 15000);
  const d = state.data,
    p = d?.product;
  return (
    <>
      <Link to="/portal/ecosystem">← MAX Universe</Link>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PRODUCT DIGITAL TWIN</div>
          <h1>{p?.name ?? "Product twin"}</h1>
          <p>Operational state, dependency signals and a traceable history.</p>
        </div>
        <Link to={`/products/${encodeURIComponent(id ?? "")}`}>
          Product details ↗
        </Link>
      </div>
      <AsyncState {...state} retry={state.reload} />
      {p && d && (
        <>
          <div className="portfolio-summary">
            <div>
              <strong>{p.health ?? "—"}</strong>
              <span>Observed health · last 24h</span>
            </div>
            <div>
              <strong>{money(p.revenue)}</strong>
              <span>Reported monthly USD</span>
            </div>
            <div>
              <strong>{p.users ?? "—"}</strong>
              <span>Observed users · last 24h</span>
            </div>
            <div>
              <strong>{p.risk}/100</strong>
              <span>Risk triage score</span>
            </div>
          </div>
          <div className="analytics-grid">
            <section className="panel">
              <h2>Lifecycle & execution</h2>
              <div className="stat-row">
                <strong>{p.stage}</strong>
                <span>{p.status}</span>
              </div>
              {d.runs.map((r) => (
                <div key={r.id} className="queue-preview">
                  <div>
                    <strong>
                      {r.stage} · {r.status}
                    </strong>
                    <span>{r.message}</span>
                  </div>
                </div>
              ))}
              <p className="muted">
                Last telemetry: {p.telemetryAt ?? "No sample"}
              </p>
              <h3>Forecast</h3>
              <p>
                {money(p.forecast.baselineNextMonthUsd)} / month ·{" "}
                {p.forecast.method}
              </p>
            </section>
            <section className="panel">
              <h2>Next best action</h2>
              <p>{p.nextBestAction}</p>
              <h3>Dependencies</h3>
              {p.dependencies.map((target) => (
                <Link
                  className="stat-row"
                  key={target}
                  to={`/portal/products/${encodeURIComponent(target)}/twin`}
                >
                  {target} ↗
                </Link>
              ))}
              {!p.dependencies.length && (
                <p>No dependency evidence supplied.</p>
              )}
              <Link
                to={`/portal/twin?root=${encodeURIComponent(`product:${p.id}`)}`}
              >
                Explore relationships ↗
              </Link>
            </section>
          </div>
          <section className="panel">
            <h2>Historical observations</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Day · UTC</th>
                    <th>Reported monthly USD</th>
                    <th>Score</th>
                    <th>Users</th>
                    <th>Stage</th>
                  </tr>
                </thead>
                <tbody>
                  {d.history.map((h) => (
                    <tr key={h.day}>
                      <td>{h.day}</td>
                      <td>{money(h.revenue)}</td>
                      <td>{h.score}</td>
                      <td>{h.users ?? "—"}</td>
                      <td>{h.stage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!d.history.length && (
              <p>History accumulates from scheduled observations.</p>
            )}
          </section>
          <section className="panel">
            <h2>Audit history</h2>
            {d.audit.map((a) => (
              <div key={a.id} className="queue-preview">
                <div>
                  <strong>
                    {a.engine} · {a.actor}
                  </strong>
                  <span>{a.reason}</span>
                  <small>{a.createdAt}</small>
                </div>
              </div>
            ))}
            {!d.audit.length && <p>No workflow events recorded.</p>}
          </section>
        </>
      )}
    </>
  );
}
