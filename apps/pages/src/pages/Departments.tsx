import { api } from "../api/client";
import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { getDepartments } from "../api/operations";
import { useApi } from "../hooks/useApi";
import { AsyncState, EmptyState } from "../components/AsyncState";
import { RefreshControl } from "../components/RefreshControl";
import { Icon } from "../components/Icon";
export default function Departments() {
  const state = useApi(getDepartments, 15000);
  const [active, setActive] = useState("GOV");
  const loadHistory = useCallback(
    (signal: AbortSignal) =>
      api<{ day: string; queued: number; running: number; blocked: number }[]>(
        `/api/departments/${encodeURIComponent(active)}/history`,
        { signal },
      ),
    [active],
  );
  const history = useApi(loadHistory, 60000);

  const department = state.data?.find((d) => d.id === active);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ICVS ORGANIZATION</div>
          <h1>
            Departments<span className="title-dot">.</span>
          </h1>
          <p>Eight teams. A connected operating system.</p>
        </div>
        <RefreshControl {...state} />
      </div>
      <AsyncState {...state} retry={state.reload} />
      <div className="department-grid">
        {state.data?.map((d) => (
          <button
            key={d.id}
            className={`department-card ${active === d.id ? "selected" : ""}`}
            onClick={() => setActive(d.id)}
            aria-pressed={active === d.id}
          >
            <span className="department-code">{d.id}</span>
            <span
              className={`badge ${d.status === "Attention" ? "attention" : "published"}`}
            >
              {d.status}
            </span>
            <h2>{d.name}</h2>
            <p>{d.description}</p>
            <div>
              <strong>{d.kpis.queued}</strong> queued{" "}
              <span>{d.kpis.averageScore ?? "—"} avg. score</span>
            </div>
          </button>
        ))}
      </div>
      {department && (
        <section className="panel department-detail">
          <div className="section-heading">
            <div>
              <div className="eyebrow">{department.id} WORKSPACE</div>
              <h2>{department.name}</h2>
              <p>{department.health}</p>
            </div>
            {department.kpis.pendingApprovals !== null && (
              <Link className="button primary" to="/approvals">
                Review {department.kpis.pendingApprovals} approvals
              </Link>
            )}
          </div>
          <div className="portfolio-summary">
            <div>
              <strong>{department.capacity ?? "—"}</strong>
              <span>
                Capacity ·{" "}
                {department.capacity === null
                  ? "not configured"
                  : department.capacityUnit}
              </span>
            </div>
            <div>
              <strong>{department.workload}</strong>
              <span>Running operations</span>
            </div>
            <div>
              <strong>{department.backlog}</strong>
              <span>Backlog</span>
            </div>
            <div>
              <strong>{department.completed7d}</strong>
              <span>Stage exits · last 7 days</span>
            </div>
          </div>
          <h3>Historical trends · daily UTC</h3>
          <AsyncState {...history} retry={history.reload} />
          {history.data?.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Queue</th>
                    <th>Running</th>
                    <th>Blocked</th>
                  </tr>
                </thead>
                <tbody>
                  {history.data.map((h) => (
                    <tr key={h.day}>
                      <td>{h.day}</td>
                      <td>{h.queued}</td>
                      <td>{h.running}</td>
                      <td>{h.blocked}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">
              Daily observations accumulate automatically.
            </p>
          )}
          <h3>Forecast</h3>
          <p>
            {department.forecasts.daysToClear === null
              ? "Insufficient completion history for a forecast."
              : `Estimated queue clearance: ${department.forecasts.daysToClear} days.`}
          </p>
          <p className="muted">{department.forecasts.method}</p>
          <h3>Recommendations</h3>
          {department.recommendations.length ? (
            <ul>
              {department.recommendations.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : (
            <p>No current recommendations.</p>
          )}
          <div className="analytics-grid">
            <div>
              <h3>Department queue</h3>
              {department.queue.length ? (
                department.queue.map((p) => (
                  <Link
                    className="stat-row"
                    to={`/products/${encodeURIComponent(p.id)}`}
                    key={p.id}
                  >
                    <span>{p.name}</span>
                    <span className="badge">{p.stage}</span>
                  </Link>
                ))
              ) : (
                <EmptyState>No products assigned to this queue.</EmptyState>
              )}
            </div>
            <div>
              <h3>Latest outputs</h3>
              {department.outputs.length ? (
                department.outputs.map((o) => (
                  <div className="stat-row" key={o.id}>
                    {o.title}
                  </div>
                ))
              ) : (
                <EmptyState>No department outputs recorded yet.</EmptyState>
              )}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
