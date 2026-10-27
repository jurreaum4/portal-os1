import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getFactory, getDivisions, mutate } from "../api/operations";
import { useApi } from "../hooks/useApi";
import { useGovernor } from "../layouts/GovernorLayout";
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
  const runs = useApi(getFactory, 15000),
    divisions = useApi(getDivisions);
  const { token } = useGovernor();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
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
        architecture, simulation, build and QA. Verified projects await Approve,
        Reject or Override. Build and QA require a connected executor; blocked
        work stays visible here.
      </p>
      {!token && (
        <p className="notice">
          Connect governor access in <Link to="/settings">Settings</Link> to
          submit ideas.
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="analytics-grid">
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Bring your next idea</h2>
              <p>Start with a clear brief and a home in your ecosystem.</p>
            </div>
            <Icon name="plus" />
          </div>
          <AsyncState {...divisions} retry={divisions.reload} />
          <form
            className="intake-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              setBusy(true);
              setError("");
              try {
                const result = await mutate<{ id: string }>(
                  "/api/intake",
                  token,
                  Object.fromEntries(data),
                );
                navigate(`/products/${result.id}`);
              } catch (c) {
                setError(c instanceof Error ? c.message : "Intake failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Product name
              <input
                name="name"
                required
                minLength={2}
                maxLength={120}
                placeholder="What will you create?"
              />
            </label>
            <label>
              Division
              <select name="divisionId" required>
                {divisions.data?.map((d) => (
                  <option value={d.id} key={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Product brief
              <textarea
                name="description"
                required
                minLength={20}
                maxLength={4000}
                rows={4}
                placeholder="Who is it for, what problem does it solve, and what should it achieve?"
              />
            </label>
            <button
              className="primary"
              disabled={!token || busy || !divisions.data?.length}
            >
              <Icon name="plus" size={16} />
              {busy ? "Saving…" : "Create product"}
            </button>
          </form>
        </section>
        <section className="panel">
          <h2>Automatic lifecycle</h2>
          <p className="muted">
            Idea → Discovery → Specification → Architecture → Simulation → Build
            → QA → Ready
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
          <EmptyState>No runs yet. Submit an idea to begin.</EmptyState>
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
