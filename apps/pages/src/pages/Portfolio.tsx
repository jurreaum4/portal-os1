import { useState } from "react";
import { Link } from "react-router-dom";
import { getConsole } from "../api/console";
import { useApi } from "../hooks/useApi";
import { AsyncState, EmptyState } from "../components/AsyncState";
import { RefreshControl } from "../components/RefreshControl";
import { Intelligence, Money } from "../components/Intelligence";
export default function Portfolio() {
  const state = useApi(getConsole, 15000);
  const [unit, setUnit] = useState("");
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("");
  const [sort, setSort] = useState("score-desc");
  const [view, setView] = useState("table");
  const products =
    state.data?.products.filter(
      (p) =>
        (!unit || p.unitId === unit) &&
        (!stage || (p.factoryStage ?? p.stage) === stage) &&
        `${p.name} ${p.description}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    ) ?? [];
  products.sort((a, b) =>
    sort === "name"
      ? a.name.localeCompare(b.name)
      : sort === "score-asc"
        ? a.score - b.score
        : b.score - a.score,
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PORTFOLIO INTELLIGENCE</div>
          <h1>
            Portfolio<span className="title-dot">.</span>
          </h1>
          <p>
            Every division. One view of performance, health and opportunity.
          </p>
        </div>
        <RefreshControl {...state} />
      </div>
      <AsyncState {...state} retry={state.reload} />
      {state.data && (
        <>
          <div
            className="division-tabs"
            role="group"
            aria-label="Portfolio division"
          >
            <button aria-pressed={!unit} onClick={() => setUnit("")}>
              All divisions
            </button>
            {state.data.units.map((u) => (
              <button
                key={u.id}
                aria-pressed={unit === u.id}
                onClick={() => setUnit(u.id)}
              >
                {u.name}
              </button>
            ))}
          </div>
          <div className="filter-toolbar">
            <label>
              Search products
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name or description"
              />
            </label>
            <label>
              Stage
              <select value={stage} onChange={(e) => setStage(e.target.value)}>
                <option value="">All stages</option>
                {[
                  ...new Set([
                    ...state.data.pipeline.map((p) => p.stage),
                    ...state.data.unclassified.map((p) => p.stage),
                  ]),
                ].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Sort by
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="score-desc">Highest score</option>
                <option value="score-asc">Lowest score</option>
                <option value="name">Name A–Z</option>
              </select>
            </label>
            <div
              className="view-toggle"
              role="group"
              aria-label="Portfolio view"
            >
              <button
                aria-pressed={view === "table"}
                onClick={() => setView("table")}
              >
                Table
              </button>
              <button
                aria-pressed={view === "cards"}
                onClick={() => setView("cards")}
              >
                Cards
              </button>
            </div>
            <span role="status">{products.length} products</span>
          </div>
          {!products.length ? (
            <EmptyState>No products reported for this selection.</EmptyState>
          ) : view === "cards" ? (
            <div className="product-grid">
              {products.map((p) => (
                <article className="panel" key={p.id}>
                  <Link to={`/products/${encodeURIComponent(p.id)}`}>
                    <h2>{p.name} ↗</h2>
                  </Link>
                  <p>
                    {p.unit ?? "Unassigned division"} ·{" "}
                    {p.factoryStage ?? p.stage}
                  </p>
                  <p>Status: {p.status ?? "Not reported"}</p>
                  <p>
                    Score: {p.score}/100 · Health:{" "}
                    {p.health === null ? "Not reported" : `${p.health}/100`}
                  </p>
                  <p>
                    Revenue:{" "}
                    <Money minor={p.revenueMinor} currency={p.currency} />{" "}
                    {p.revenuePeriod}
                  </p>
                  <p>Forecast: {p.forecast ?? "Not reported"}</p>
                  <small>
                    {p.observedAt
                      ? `${p.source} · ${p.observedAt}${p.stale ? " · Stale" : ""}`
                      : "Awaiting observations"}
                  </small>
                </article>
              ))}
            </div>
          ) : (
            <div className="panel table-wrap">
              <table>
                <caption className="sr-only">Portfolio performance</caption>
                <thead>
                  <tr>
                    {[
                      "Product",
                      "Stage / status",
                      "Score",
                      "Health",
                      "Revenue",
                      "Forecast",
                    ].map((h) => (
                      <th scope="col" key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link to={`/products/${encodeURIComponent(p.id)}`}>
                          <strong>{p.name} ↗</strong>
                        </Link>
                        <small className="cell-detail">
                          {p.unit ?? "Unassigned division"}
                        </small>
                      </td>
                      <td>
                        {p.factoryStage ?? p.stage}
                        <small className="cell-detail">
                          {p.status ?? "Not reported"}
                          {p.stale && p.observedAt ? " · Stale" : ""}
                        </small>
                      </td>
                      <td>
                        <strong>{p.score}</strong> / 100
                      </td>
                      <td>
                        {p.health === null ? "Not reported" : `${p.health}/100`}
                        {p.stale && p.health !== null && (
                          <small className="cell-detail">Stale</small>
                        )}
                      </td>
                      <td>
                        <Money minor={p.revenueMinor} currency={p.currency} />
                        <small className="cell-detail">
                          {p.revenuePeriod}
                          {p.stale && p.revenueMinor !== null ? " · Stale" : ""}
                        </small>
                      </td>
                      <td>
                        {p.forecast ?? "Not reported"}
                        <small className="cell-detail">
                          {p.observedAt ? `${p.source} · ${p.observedAt}` : ""}
                          {p.stale && p.forecast ? " · Stale" : ""}
                        </small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Intelligence data={state.data} unitId={unit} />
        </>
      )}
    </>
  );
}
