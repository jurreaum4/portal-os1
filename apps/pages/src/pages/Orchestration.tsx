import { Link } from "react-router-dom";
import { getFactory } from "../api/operations";
import { useApi } from "../hooks/useApi";
import { AsyncState, EmptyState } from "../components/AsyncState";
import { Icon } from "../components/Icon";
const engines = [
  ["Idea Intake", "STRAT", "Accept submitted product briefs"],
  ["Specification", "ARCH", "Derive scope from the submitted brief"],
  ["Architecture", "ARCH", "Define implementation handoffs"],
  ["Simulation", "ARCH", "Verify lifecycle reachability"],
  ["Workflow", "BUILD", "Advance stages and retry interrupted work"],
  ["Promotion", "GOV", "Require build, QA and governor approval"],
  ["Archive", "OPS", "Retain rejected projects and their history"],
  ["Resource Allocation", "OPS", "Limit concurrent execution operations"],
  ["Project Scoring", "DATA", "Score lifecycle evidence completeness"],
];
export default function Orchestration() {
  const runs = useApi(getFactory, 15000);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">AUTONOMOUS PRODUCT FACTORY</div>
          <h1>
            From idea to impact<span className="title-dot">.</span>
          </h1>
          <p>A governed workflow for the products you build next.</p>
        </div>
        <span className="subtle-badge">
          <Icon name="spark" size={14} />
          Lifecycle automation
        </span>
      </div>
      <div className="engine-grid">
        {engines.map(([name, team, desc], i) => (
          <div className="engine-card" key={name}>
            <span>
              0{i + 1} <b>{team}</b>
            </span>
            <Icon name={i < 4 ? "spark" : "code"} size={21} />
            <h3>{name}</h3>
            <p>{desc}</p>
            <small>Automatic</small>
          </div>
        ))}
      </div>
      <p className="notice">
        Ideas advance automatically through discovery, specification,
        architecture, simulation, build, QA and packaging. Verified projects
        await Approve, Reject or Override. Build and QA require a connected
        executor; blocked work stays visible here.
      </p>
      <div className="analytics-grid">
        <section className="panel">
          <h2>Automated intake</h2>
          <p>
            Connected idea sources submit validated briefs into ICVS. Accepted
            ideas are assigned to their division and begin processing
            automatically.
          </p>
          <p className="muted">
            Review decisions in the approval queue. Execution and integration
            blockers appear in the factory runs below.
          </p>
        </section>
        <section className="panel">
          <h2>Automatic lifecycle</h2>
          <p className="muted">
            Idea → Discovery → Specification → Architecture → Simulation → Build
            → QA → Package → Ready → Published
          </p>
          <p>
            New ideas start automatically. The governor approves, rejects or
            overrides promotion decisions in the existing approval queue.
          </p>
          <Link className="button" to="/approvals">
            Review decisions →
          </Link>
          <div className="factory-flow">
            <span>Persisted in D1</span>
            <span>Coordinated by Durable Objects</span>
            <span>One active run per product</span>
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>Factory runs</h2>
          <span className="small-tag">LIVE QUEUE</span>
        </div>
        <AsyncState {...runs} retry={runs.reload} />
        {runs.data?.length === 0 && (
          <EmptyState>
            No runs yet. Waiting for connected idea sources.
          </EmptyState>
        )}
        {runs.data?.map((r) => (
          <Link
            className="factory-run"
            to={`/products/${encodeURIComponent(r.productId)}`}
            key={r.id}
          >
            <span className="activity-symbol warning">
              <Icon name="code" />
            </span>
            <div>
              <strong>{r.name}</strong>
              <p>{r.message}</p>
            </div>
            <span className="badge attention">
              {r.status} · {r.stage}
            </span>
            <Icon name="arrow" />
          </Link>
        ))}
      </section>
    </>
  );
}
