import { Link } from "react-router-dom";
import { getAutomation } from "../api/automation";
import { useApi } from "../hooks/useApi";
import { AsyncState, EmptyState } from "./AsyncState";
import { RefreshControl } from "./RefreshControl";
export function AutomationOverview({ compact = false }: { compact?: boolean }) {
  const state = useApi(getAutomation, 15000);
  const data = state.data;
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <div className="eyebrow">ICVS AUTOMATION</div>
          <h2>Autonomous management</h2>
          <p className="muted">
            Planning runs automatically. Execution advances on worker evidence.
          </p>
        </div>
        <RefreshControl {...state} />
      </div>
      <AsyncState {...state} retry={state.reload} />
      {data && (
        <>
          <div className="automation-totals">
            {["Submitted", "Qualified", "Rejected"].map((status) => (
              <div key={status}>
                <strong>
                  {data.ideas.find((i) => i.state === status)?.count ?? 0}
                </strong>
                <span>{status} ideas</span>
              </div>
            ))}
            <div>
              <strong>
                {
                  data.workflows.filter((w) => w.status === "awaiting_governor")
                    .length
                }
              </strong>
              <span>Governor interventions</span>
            </div>
          </div>
          {!data.workflows.length && (
            <EmptyState>
              No managed projects yet. Connected intake producers can submit
              ideas through the existing Worker.
            </EmptyState>
          )}
          {data.workflows.slice(0, compact ? 5 : 100).map((w) => (
            <Link
              className="signal-row"
              key={w.product_id}
              to={`/products/${encodeURIComponent(w.product_id)}`}
            >
              <div>
                <h3>{w.name}</h3>
                <p>
                  {w.stage} · {w.status.replaceAll("_", " ")} · Generation{" "}
                  {w.generation}
                </p>
                <small>
                  {w.reason} · {w.updated_at}
                </small>
              </div>
              <span>→</span>
            </Link>
          ))}
          <h3>Simulation outlook</h3>
          <p className="muted">
            Heuristic planning estimates from submitted constraints. Success
            probability is not statistically calibrated.
          </p>
          {!data.simulations.length && (
            <EmptyState>No simulation results yet.</EmptyState>
          )}
          {data.simulations.slice(0, compact ? 3 : 100).map((s) => (
            <div className="simulation-card" key={s.product_id}>
              <Link to={`/products/${encodeURIComponent(s.product_id)}`}>
                <h3>{s.name}</h3>
              </Link>
              <dl>
                <div>
                  <dt>Complexity</dt>
                  <dd>{s.content.complexityScore}/100</dd>
                </div>
                <div>
                  <dt>Risk</dt>
                  <dd>{s.content.riskScore}/100</dd>
                </div>
                <div>
                  <dt>Forecast score</dt>
                  <dd>{s.content.forecastScore}/100</dd>
                </div>
                <div>
                  <dt>Success probability estimate</dt>
                  <dd>{Math.round(s.content.successProbability * 100)}%</dd>
                </div>
              </dl>
            </div>
          ))}
          <h3>Department allocation</h3>
          <div className="department-grid">
            {data.resources.map((r) => (
              <article className="department-card" key={r.department}>
                <h3>{r.department}</h3>
                <dl>
                  <div>
                    <dt>Capacity</dt>
                    <dd>{r.capacity}</dd>
                  </div>
                  <div>
                    <dt>Workload</dt>
                    <dd>{r.workload}</dd>
                  </div>
                  <div>
                    <dt>Backlog</dt>
                    <dd>{r.backlog}</dd>
                  </div>
                  <div>
                    <dt>Failed work</dt>
                    <dd>{r.failed}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
          <h3>Next best action</h3>
          {!data.promotions.length && (
            <EmptyState>
              Lifecycle recommendations appear after qualification.
            </EmptyState>
          )}
          {data.promotions.slice(0, compact ? 5 : 100).map((p) => (
            <Link
              className="signal-row"
              key={p.product_id}
              to={`/products/${encodeURIComponent(p.product_id)}`}
            >
              <span className="badge">{p.classification}</span>
              <div>
                <h3>{p.name}</h3>
                <p>{p.nextAction ?? p.reason}</p>
                <small>{p.reason}</small>
                {p.opportunity && <p>Opportunity: {p.opportunity}</p>}
                {p.risk && <p>Risk: {p.risk}</p>}
              </div>
              <span>→</span>
            </Link>
          ))}
          {!compact && (
            <>
              <h3>Audit trail</h3>
              <p className="muted">
                Latest 100 events. Project views retain generation history and
                evidence.
              </p>
              <div className="automation-audit">
                {data.events.map((e) => (
                  <div className="signal-row" key={e.id}>
                    <div>
                      <strong>
                        {e.kind} · {e.action}
                      </strong>
                      <p>
                        {e.from_state ? `${e.from_state} → ` : ""}
                        {e.to_state}
                      </p>
                      <small>
                        {e.occurred_at} · {e.entity_id}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {compact && (
        <Link className="button" to="/orchestration">
          View automation and audit →
        </Link>
      )}
    </section>
  );
}
