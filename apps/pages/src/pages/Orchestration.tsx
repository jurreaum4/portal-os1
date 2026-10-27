import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getFactory, getDivisions, mutate } from "../api/operations";
import { getProducts } from "../api/products";
import { useApi } from "../hooks/useApi";
import { useGovernor } from "../layouts/GovernorLayout";
import { AsyncState, EmptyState } from "../components/AsyncState";
import { Icon } from "../components/Icon";
const engines = [
  ["Intake", "STRAT", "Capture the product brief"],
  ["Specification", "ARCH", "Create acceptance criteria"],
  ["Architecture", "ARCH", "Propose system boundaries"],
  ["Simulation", "ARCH", "Check planning completeness"],
  ["Build", "BUILD", "Requires build executor"],
  ["QA", "TEST", "Requires test executor"],
  ["Package", "OPS", "Requires package artifacts"],
  ["Publishing", "GOV", "Requires release integration"],
];
export default function Orchestration() {
  const runs = useApi(getFactory, 15000),
    products = useApi(getProducts, 15000),
    divisions = useApi(getDivisions);
  const { token } = useGovernor();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [selected, setSelected] = useState("");
  async function run(id: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await mutate(`/api/factory/${encodeURIComponent(id)}/run`, token);
      runs.reload();
      products.reload();
      setMessage(
        "Planning outputs saved. Open the product to review the specification, architecture, simulation, and build handoff.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run failed");
    } finally {
      setBusy(false);
    }
  }
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
          Planning automation
        </span>
      </div>
      <div className="engine-grid">
        {engines.map(([name, team, desc], i) => (
          <div
            className={`engine-card ${i > 3 ? "pending-engine" : ""}`}
            key={name}
          >
            <span>
              0{i + 1} <b>{team}</b>
            </span>
            <Icon name={i < 4 ? "spark" : "code"} size={21} />
            <h3>{name}</h3>
            <p>{desc}</p>
            <small>{i < 4 ? "Available" : "Integration required"}</small>
          </div>
        ))}
      </div>
      <p className="notice">
        The factory creates planning artifacts and pauses at Build. Build, QA,
        packaging, and publication require execution integrations. Governor
        approval records intent and does not deploy products.
      </p>
      {!token && (
        <p className="notice">
          Connect governor access in <Link to="/settings">Settings</Link> to
          submit ideas or run the factory.
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice success" role="status">
          {message}
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
          <h2>Start a planning run</h2>
          <p className="muted">
            Intake → Specification → Architecture → Simulation → Build handoff
          </p>
          <AsyncState {...products} retry={products.reload} />
          <label className="stacked-label">
            Product
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Choose an idea</option>
              {products.data
                ?.filter((p) =>
                  ["Idea", "Discovery", "Validation"].includes(p.stage),
                )
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          <button
            className="primary"
            disabled={!token || busy || !selected}
            onClick={() => void run(selected)}
          >
            <Icon name="spark" size={16} />
            Run planning engines
          </button>
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
          <EmptyState>No runs yet. Choose an idea to begin.</EmptyState>
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
