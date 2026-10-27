import { useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { Graph } from "../api/universe";
import { useApi } from "../hooks/useApi";
import { AsyncState } from "../components/AsyncState";
export default function TwinGraph() {
  const [params, setParams] = useSearchParams();
  const root = params.get("root") ?? "";
  const load = useCallback(
    (signal: AbortSignal) =>
      api<Graph>(
        `/api/twin/graph${root ? `?root=${encodeURIComponent(root)}&depth=2` : ""}`,
        { signal },
      ),
    [root],
  );
  const state = useApi(load, 15000);
  const d = state.data;
  const displayed = d?.nodes.slice(0, 40) ?? [];
  const positions = new Map(
    displayed.map((n, i) => [
      n.id,
      { x: 80 + (i % 5) * 165, y: 50 + Math.floor(i / 5) * 90 },
    ]),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ECOSYSTEM DIGITAL TWIN</div>
          <h1>
            Connected by design<span className="title-dot">.</span>
          </h1>
          <p>
            Explore divisions, products, projects, departments, approvals and
            pipelines.
          </p>
        </div>
      </div>
      <AsyncState {...state} retry={state.reload} />
      {d && (
        <>
          <div className="filter-toolbar">
            <label>
              Explore from
              <select
                value={root}
                onChange={(e) =>
                  setParams(e.target.value ? { root: e.target.value } : {})
                }
              >
                <option value="">Entire ecosystem</option>
                {d.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.kind} · {n.label}
                  </option>
                ))}
              </select>
            </label>
            {root && (
              <button onClick={() => setParams({})}>
                Show entire ecosystem
              </button>
            )}
            <span>
              {d.nodes.length} nodes · {d.edges.length} relationships
            </span>
          </div>
          <section className="panel">
            <h2>Relationship map</h2>
            <p className="muted">
              Select a node to explore its neighbourhood. The diagram shows up
              to 40 nodes; the complete relationship list appears below.
            </p>
            <div className="twin-graph">
              <svg
                role="img"
                aria-label="Interactive ecosystem dependency graph"
                viewBox={`0 0 850 ${Math.max(220, Math.ceil(displayed.length / 5) * 90 + 30)}`}
              >
                {d.edges
                  .filter(
                    (e) => positions.has(e.source) && positions.has(e.target),
                  )
                  .map((e) => (
                    <line
                      key={e.id}
                      x1={positions.get(e.source)!.x}
                      y1={positions.get(e.source)!.y}
                      x2={positions.get(e.target)!.x}
                      y2={positions.get(e.target)!.y}
                      stroke="#cbc4e7"
                      strokeWidth="2"
                    />
                  ))}
                {displayed.map((n) => (
                  <a
                    key={n.id}
                    href={`?root=${encodeURIComponent(n.id)}`}
                    onClick={(e) => {
                      if (!e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        setParams({ root: n.id });
                      }
                    }}
                    aria-label={`Explore ${n.label}`}
                  >
                    <rect
                      x={positions.get(n.id)!.x - 67}
                      y={positions.get(n.id)!.y - 24}
                      width="134"
                      height="48"
                      rx="12"
                      fill={n.kind === "product" ? "#ece7ff" : "#f1f4f7"}
                      stroke="#b5a7e0"
                    />
                    <text
                      x={positions.get(n.id)!.x}
                      y={positions.get(n.id)!.y - 3}
                      textAnchor="middle"
                      fontSize="10"
                      fill="#58516b"
                    >
                      {n.kind}
                    </text>
                    <text
                      x={positions.get(n.id)!.x}
                      y={positions.get(n.id)!.y + 12}
                      textAnchor="middle"
                      fontSize="11"
                      fill="#242332"
                    >
                      {n.label.length > 19
                        ? n.label.slice(0, 17) + "…"
                        : n.label}
                    </text>
                  </a>
                ))}
              </svg>
            </div>
          </section>
          <section className="panel">
            <h2>Relationships</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>From</th>
                    <th>Relationship</th>
                    <th>To</th>
                  </tr>
                </thead>
                <tbody>
                  {d.edges.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => setParams({ root: e.source })}
                        >
                          {d.nodes.find((n) => n.id === e.source)?.label ??
                            e.source}
                        </button>
                      </td>
                      <td>{e.relation.replaceAll("_", " ")}</td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => setParams({ root: e.target })}
                        >
                          {d.nodes.find((n) => n.id === e.target)?.label ??
                            e.target}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!d.edges.length && <p>No relationships in this selection.</p>}
          </section>
          <section className="panel">
            <h2>XR data scenes</h2>
            <p>
              Five versioned spatial data contracts are available to authorised
              consumers. XR rendering is outside this release.
            </p>
            <ul>
              <li>Ecosystem Galaxy</li>
              <li>Product Constellation</li>
              <li>Pipeline Universe</li>
              <li>Department Operations Centre</li>
              <li>Quantum XR Command Room</li>
            </ul>
            <Link to="/portal/ecosystem">Return to command centre ↗</Link>
          </section>
        </>
      )}
    </>
  );
}
