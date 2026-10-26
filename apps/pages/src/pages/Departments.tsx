import { useState } from "react";
import { Link } from "react-router-dom";
import { getDepartments } from "../api/operations";
import { useApi } from "../hooks/useApi";
import { AsyncState, EmptyState } from "../components/AsyncState";
import { RefreshControl } from "../components/RefreshControl";
import { Icon } from "../components/Icon";
export default function Departments() {
  const state = useApi(getDepartments, 15000);
  const [active, setActive] = useState("GOV");
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
