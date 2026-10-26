import { Link } from "react-router-dom";
import { api } from "../api/client";
import { getHealth, getRecommendations } from "../api/operations";
import { getApprovals } from "../api/approvals";
import { getPortfolio } from "../api/products";
import { useApi } from "../hooks/useApi";
import { AsyncState, EmptyState } from "../components/AsyncState";
import { Icon } from "../components/Icon";
const getDecisions = (signal?: AbortSignal) =>
  api<
    {
      id: string;
      project: string;
      action: string;
      status: string;
      note: string;
      decidedAt: string;
    }[]
  >("/api/decisions", { signal });
export default function Governance() {
  const approvals = useApi(getApprovals, 15000),
    products = useApi(getPortfolio, 15000),
    health = useApi(getHealth, 15000),
    recs = useApi(getRecommendations),
    history = useApi(getDecisions, 15000);
  const alerts = products.data?.filter((p) => p.status === "Attention") ?? [];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">EXECUTIVE CONTROL</div>
          <h1>
            Governor console<span className="title-dot">.</span>
          </h1>
          <p>The decisions that shape the MAX ecosystem.</p>
        </div>
        <Link className="button primary" to="/approvals">
          <Icon name="approvals" />
          Open approval centre
        </Link>
      </div>
      <div className="portfolio-summary">
        <div>
          <strong>
            {products.data?.length
              ? Math.round(
                  products.data.reduce((s, p) => s + p.score, 0) /
                    products.data.length,
                )
              : "—"}
            <small>/100</small>
          </strong>
          <span>Portfolio health score</span>
        </div>
        <div>
          <strong>{approvals.data?.length ?? "—"}</strong>
          <span>Pending governor decisions</span>
        </div>
        <div>
          <strong>{products.data ? alerts.length : "—"}</strong>
          <span>Products needing attention</span>
        </div>
      </div>
      <div className="analytics-grid">
        <section className="panel">
          <h2>Critical alerts</h2>
          <AsyncState {...products} retry={products.reload} />
          {alerts.map((p) => (
            <Link
              className="queue-preview"
              key={p.id}
              to={`/products/${encodeURIComponent(p.id)}`}
            >
              <span className="activity-symbol warning">
                <Icon name="health" />
              </span>
              <div>
                <strong>{p.name}</strong>
                <span>{p.stage} · Product health requires review</span>
              </div>
              <Icon name="arrow" />
            </Link>
          ))}
          {products.data && !alerts.length && (
            <EmptyState>No products are flagged.</EmptyState>
          )}
          <h2 className="subheading">Approval queue</h2>
          <AsyncState {...approvals} retry={approvals.reload} />
          {approvals.data?.map((a) => (
            <Link
              className="queue-preview"
              to={`/approvals?product=${encodeURIComponent(a.productId)}`}
              key={a.id}
            >
              <div>
                <strong>{a.project}</strong>
                <span>{a.action}</span>
              </div>
              <span className={`priority-tag ${a.priority.toLowerCase()}`}>
                {a.priority}
              </span>
              <Icon name="arrow" />
            </Link>
          ))}
          {approvals.data?.length === 0 && (
            <EmptyState>No decisions waiting.</EmptyState>
          )}
        </section>
        <section className="panel">
          <h2>System status</h2>
          <AsyncState {...health} retry={health.reload} />
          {health.data?.services.map((s) => (
            <div className="stat-row" key={s.name}>
              <span>{s.name}</span>
              <span className="badge">{s.status}</span>
            </div>
          ))}
          <h2 className="subheading">Recommendations</h2>
          <AsyncState {...recs} retry={recs.reload} />
          {recs.data?.map((r) => (
            <Link
              className="recommendation"
              to={`/products/${encodeURIComponent(r.productId)}`}
              key={r.id}
            >
              <span>
                <Icon name="spark" size={16} />
              </span>
              <div>
                <strong>{r.name}</strong>
                <p>{r.reason}</p>
              </div>
            </Link>
          ))}
          {recs.data?.length === 0 && (
            <EmptyState>No recommendations yet.</EmptyState>
          )}
        </section>
      </div>
      <section className="panel">
        <h2>Decision history</h2>
        <AsyncState {...history} retry={history.reload} />
        {history.data?.length === 0 && (
          <EmptyState>No governor decisions recorded.</EmptyState>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Action</th>
                <th>Decision</th>
                <th>Override reason</th>
                <th>Decided (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {history.data?.map((d) => (
                <tr key={d.id}>
                  <td>{d.project}</td>
                  <td>{d.action}</td>
                  <td>
                    <span className="badge">{d.status}</span>
                  </td>
                  <td>{d.note || "—"}</td>
                  <td>{d.decidedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
