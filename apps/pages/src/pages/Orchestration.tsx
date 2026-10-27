import { Link } from "react-router-dom";
import { getConsole } from "../api/console";
import { getApprovals } from "../api/approvals";
import { getGovernance } from "../api/analytics";
import { AsyncState, EmptyState } from "../components/AsyncState";
import { Factory } from "../components/Factory";
import { RefreshControl } from "../components/RefreshControl";
import { useApi } from "../hooks/useApi";
export default function Orchestration() {
  const pipeline = useApi(getConsole, 15000);
  const approvals = useApi(getApprovals);
  const governance = useApi(getGovernance);
  const ready =
    pipeline.data?.pipeline.find((column) => column.stage === "Ready")
      ?.products ?? [];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ICVS ORCHESTRATION</div>
          <h1>
            Orchestration<span className="title-dot">.</span>
          </h1>
          <p>
            Follow product progress, review handoffs, and resolve pending
            decisions.
          </p>
        </div>
        <RefreshControl
          updatedAt={pipeline.updatedAt}
          refreshing={
            pipeline.refreshing || approvals.refreshing || governance.refreshing
          }
          reload={() => {
            pipeline.reload();
            approvals.reload();
            governance.reload();
          }}
        />
      </div>
      <div className="analytics-grid orchestration-top">
        <section className="panel">
          <div className="section-heading">
            <h2>Ready for the next step</h2>
            <Link to="/approvals">Approval centre →</Link>
          </div>
          <AsyncState {...pipeline} retry={pipeline.reload} />
          <AsyncState {...approvals} retry={approvals.reload} />
          {pipeline.data && ready.length === 0 && (
            <EmptyState>No products are at the Ready stage.</EmptyState>
          )}
          {pipeline.data &&
            ready.map((product) => {
              const pending = approvals.data?.filter(
                (approval) => approval.productId === product.id,
              );
              return (
                <div className="handoff-row" key={product.id}>
                  <div>
                    <Link to={`/products/${encodeURIComponent(product.id)}`}>
                      <strong>{product.name} ↗</strong>
                    </Link>
                    <p>Score {product.score} / 100 · Ready</p>
                  </div>
                  <div>
                    {pending === undefined ? (
                      <span className="muted">Approval status unavailable</span>
                    ) : pending.length ? (
                      <Link
                        className="button primary"
                        to={`/approvals?product=${encodeURIComponent(product.id)}`}
                      >
                        Review {pending.length}{" "}
                        {pending.length === 1 ? "request" : "requests"}
                      </Link>
                    ) : (
                      <span className="badge">No pending request</span>
                    )}
                  </div>
                </div>
              );
            })}
        </section>
        <section className="panel">
          <h2>Decision overview</h2>
          <AsyncState {...governance} retry={governance.reload} />
          {governance.data?.length === 0 && (
            <EmptyState>No decisions recorded yet.</EmptyState>
          )}
          {governance.data?.map((row) => (
            <div className="stat-row" key={row.status}>
              <span>{row.status}</span>
              <strong>{row.count}</strong>
            </div>
          ))}
          <p className="muted">
            Approval decisions record governor intent. Publication and runtime
            execution remain separate operations.
          </p>
          <Link className="button" to="/runtime">
            Monitor runtime →
          </Link>
        </section>
      </div>
      <div className="section-heading board-heading">
        <div>
          <h2>Product workflow</h2>
          <p>Current stage of each product, from idea to live release.</p>
        </div>
      </div>
      {pipeline.data && <Factory data={pipeline.data} />}
    </>
  );
}
