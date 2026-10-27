import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Operations } from "../api/universe";
import { useApi } from "../hooks/useApi";
import { AsyncState } from "../components/AsyncState";
import { RefreshControl } from "../components/RefreshControl";
const load = (signal?: AbortSignal) =>
  api<Operations>("/api/execution-workers", { signal });
export default function ExecutionWorkers() {
  const state = useApi(load, 15000);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ICVS EXECUTION LAYER</div>
          <h1>
            Evidence in motion<span className="title-dot">.</span>
          </h1>
          <p>Worker attempts, leases, verified results and compensation.</p>
        </div>
        <RefreshControl {...state} />
      </div>
      <AsyncState {...state} retry={state.reload} />
      {state.data && (
        <>
          <section className="universe-divisions">
            {state.data.workers.map((w) => (
              <article className="panel" key={w.name}>
                <div className="eyebrow">EXECUTION WORKER</div>
                <h2>{w.name}</h2>
                <span className="badge">{w.health}</span>
                <div className="stat-row">
                  <span>Queue</span>
                  <strong>{w.queued}</strong>
                </div>
                <div className="stat-row">
                  <span>Blocked</span>
                  <strong>{w.blocked}</strong>
                </div>
                <div className="stat-row">
                  <span>Expired leases</span>
                  <strong>{w.expiredLeases}</strong>
                </div>
              </article>
            ))}
          </section>
          <p className="muted">{state.data.healthSource}</p>
          <section className="panel">
            <h2>Operation queue & attempts</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Worker</th>
                    <th>Product</th>
                    <th>Status</th>
                    <th>Attempts</th>
                    <th>Lease expires · UTC</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {state.data.operations.map((o) => (
                    <tr key={o.id}>
                      <td>{o.worker}</td>
                      <td>
                        <Link
                          to={`/portal/products/${encodeURIComponent(o.productId)}/twin`}
                        >
                          {o.productId}
                        </Link>
                      </td>
                      <td>{o.status}</td>
                      <td>{o.attempts}</td>
                      <td>
                        {o.leaseExpiresAt
                          ? new Date(o.leaseExpiresAt).toISOString()
                          : "—"}
                      </td>
                      <td>{o.message || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!state.data.operations.length && (
              <p>No external execution attempts recorded.</p>
            )}
          </section>
          <section className="panel">
            <h2>Compensation queue</h2>
            {state.data.compensation.map((c) => (
              <div className="queue-preview" key={c.id}>
                <div>
                  <Link
                    to={`/portal/products/${encodeURIComponent(c.productId)}/twin`}
                  >
                    {c.productId}
                  </Link>
                  <span>
                    {c.status} · {c.attempts} attempts
                  </span>
                  <p>{c.message}</p>
                </div>
              </div>
            ))}
            {!state.data.compensation.length && (
              <p>No rejected package resources awaiting compensation.</p>
            )}
          </section>
        </>
      )}
    </>
  );
}
