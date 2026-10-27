import { Link } from "react-router-dom";
import type { ConsoleSnapshot } from "../../../console-contract";
export function Factory({
  data,
  compact = false,
}: {
  data: ConsoleSnapshot;
  compact?: boolean;
}) {
  return (
    <>
      <div className="factory-track" aria-label="Product factory stages">
        {data.pipeline.map((column, i) => (
          <section className="factory-stage" key={column.stage}>
            <div className="eyebrow">{String(i + 1).padStart(2, "0")}</div>
            <strong>{column.products.length}</strong>
            <h3>{column.stage}</h3>
            {column.stage === "Test" && <small>QA</small>}
            {column.stage === "Ready" && <small>Ready to publish</small>}
            {!compact &&
              column.products.map((p) => (
                <Link
                  className="factory-product"
                  key={p.id}
                  to={`/products/${encodeURIComponent(p.id)}`}
                >
                  <strong>{p.name}</strong>
                  <span>{p.status ?? "Status not reported"}</span>
                  <small>
                    {p.observedAt
                      ? `${p.stale ? "Stale · " : ""}${p.observedAt}`
                      : `Legacy stage: ${p.stage}`}
                  </small>
                </Link>
              ))}
          </section>
        ))}
      </div>
      {!compact && data.unclassified.length > 0 && (
        <section className="panel">
          <h2>Unclassified / archived</h2>
          <p>
            Legacy stages without an exact factory equivalent remain visible
            here.
          </p>
          {data.unclassified.map((p) => (
            <Link
              className="signal-row"
              to={`/products/${encodeURIComponent(p.id)}`}
              key={p.id}
            >
              {p.name}
              <span>{p.stage}</span>
            </Link>
          ))}
        </section>
      )}
    </>
  );
}
