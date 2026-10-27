import { AutomationOverview } from "../components/AutomationOverview";
import { Link } from "react-router-dom";
import { getConsole } from "../api/console";
import { useApi } from "../hooks/useApi";
import { MetricTile } from "../components/MetricTile";
import { AsyncState, EmptyState } from "../components/AsyncState";
import { RefreshControl } from "../components/RefreshControl";
import { Intelligence, Money } from "../components/Intelligence";
import { Departments } from "../components/Departments";
import { Factory } from "../components/Factory";
import { SystemHealth } from "../components/SystemHealth";
export default function Dashboard() {
  const state = useApi(getConsole, 15000);
  const data = state.data;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">GOVERNOR CONSOLE / OVERVIEW</div>
          <h1>
            Mission control<span className="title-dot">.</span>
          </h1>
          <p>
            One command centre. Every portfolio, decision and operational
            signal.
          </p>
        </div>
        <RefreshControl {...state} />
      </div>
      <AsyncState {...state} retry={state.reload} />
      {data && (
        <>
          <div className="command-banner">
            <div>
              <span className="eyebrow">PORTAL INTELLIGENCE</span>
              <h2>Your ecosystem, in focus.</h2>
              <p>
                {data.products.length} products · {data.units.length} portfolio
                divisions · {data.approvals.length} decisions awaiting the
                Governor
              </p>
            </div>
            <Link className="button primary" to="/approvals">
              Review decisions →
            </Link>
          </div>
          <div className="metrics console-metrics">
            <MetricTile
              title="Ecosystem health"
              value={data.ecosystemHealth}
              detail="% healthy stored process states"
              icon="⌁"
            />
            <MetricTile
              title="Portfolio score"
              value={data.portfolioScore}
              detail="Average recorded score / 100"
              icon="◈"
            />
            <MetricTile
              title="Portfolio health"
              value={data.portfolioHealth}
              detail={`${data.healthCoverage}/${data.products.length} products with fresh health`}
              icon="◎"
            />
            <MetricTile
              title="Active pipelines"
              value={data.activePipelines}
              detail="Products at known pre-publication stages"
              icon="⇢"
            />
            <MetricTile
              title="Critical alerts"
              value={data.alerts.length}
              detail="High-risk decisions, panics & low health"
              icon="!"
            />
          </div>
          <div className="intelligence-grid">
            <section className="panel">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">GOVERNANCE</div>
                  <h2>
                    Decisions awaiting you{" "}
                    <span className="count">{data.approvals.length}</span>
                  </h2>
                </div>
                <Link to="/approvals">View all →</Link>
              </div>
              {!data.approvals.length && (
                <EmptyState>
                  No pending decisions. The approval queue is clear.
                </EmptyState>
              )}
              {data.approvals.slice(0, 4).map((a) => (
                <Link
                  className="signal-row"
                  key={a.id}
                  to={`/approvals?product=${encodeURIComponent(a.productId)}`}
                >
                  <span className="signal-icon">✓</span>
                  <div>
                    <h3>{a.project}</h3>
                    <p>
                      {a.action} · {a.risk} risk
                    </p>
                  </div>
                  <span className={`priority-tag ${a.priority.toLowerCase()}`}>
                    {a.priority}
                  </span>
                </Link>
              ))}
            </section>
            <section className="panel">
              <div className="eyebrow">ATTENTION REQUIRED</div>
              <h2>Critical alerts</h2>
              {!data.alerts.length && (
                <EmptyState>
                  No critical alerts in reported data. Missing telemetry is not
                  a health guarantee.
                </EmptyState>
              )}
              {data.alerts.map((a) => (
                <Link className="signal-row" key={a.id} to={a.href}>
                  <span className="signal-icon alert-icon">!</span>
                  <div>
                    <h3>{a.title}</h3>
                    <p>{a.detail}</p>
                  </div>
                  <span>→</span>
                </Link>
              ))}
            </section>
          </div>
          <section className="panel">
            <div className="section-heading">
              <div>
                <div className="eyebrow">AUTONOMOUS PRODUCT FACTORY</div>
                <h2>From idea to published</h2>
              </div>
              <Link to="/pipeline">Explore progression →</Link>
            </div>
            <Factory data={data} compact />
            <p className="muted">
              Automatically refreshed from recorded system state.{" "}
              {data.unclassified.length} products have no exact factory stage.
              Managed workflows advance through evidence-backed automation and
              governor gates.
            </p>
          </section>
          <div className="intelligence-grid">
            <section className="panel">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">PORTFOLIO RANKINGS</div>
                  <h2>Leading products</h2>
                </div>
                <Link to="/portfolio">All divisions →</Link>
              </div>
              {!data.products.length && (
                <EmptyState>No products have been reported.</EmptyState>
              )}
              {data.products.slice(0, 5).map((p, i) => (
                <Link
                  className="signal-row"
                  key={p.id}
                  to={`/products/${encodeURIComponent(p.id)}`}
                >
                  <span className="leader-rank">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3>{p.name}</h3>
                    <p>
                      {p.unit ?? "Unassigned division"} ·{" "}
                      {p.factoryStage ?? p.stage}
                    </p>
                  </div>
                  <strong>
                    {p.score}
                    <small>/100</small>
                  </strong>
                </Link>
              ))}
            </section>
            <section className="panel">
              <div className="eyebrow">COMMERCIAL PERFORMANCE</div>
              <h2>Reported revenue</h2>
              <p className="muted">
                Fresh observations only. Currency and reporting periods are kept
                separate.
              </p>
              {!data.revenue.length && (
                <EmptyState>
                  Revenue not reported. No financial feed is connected.
                </EmptyState>
              )}
              {data.revenue.map((r) => (
                <div className="revenue-row" key={`${r.currency}-${r.period}`}>
                  <strong>
                    <Money minor={r.minor} currency={r.currency} />
                  </strong>
                  <p>
                    {r.period} · {r.coverage}/{data.products.length} products
                    reporting
                  </p>
                </div>
              ))}
            </section>
          </div>
          <AutomationOverview compact />
          <Intelligence data={data} />
          <section className="panel">
            <div className="section-heading">
              <div>
                <div className="eyebrow">ICVS OPERATIONS</div>
                <h2>Department status</h2>
              </div>
              <Link to="/departments">Operations centre →</Link>
            </div>
            <Departments rows={data.departments} />
          </section>
        </>
      )}
      <SystemHealth />
    </>
  );
}
