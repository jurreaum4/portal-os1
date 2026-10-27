import type { ConsoleDepartment } from "../../../console-contract";
export function Departments({ rows }: { rows: ConsoleDepartment[] }) {
  return (
    <div className="department-grid">
      {rows.map((row) => (
        <article className="department-card" key={row.department}>
          <div className="section-heading">
            <h3>{row.department}</h3>
            <span
              className={`signal-status ${row.stale ? "unknown" : "observed"}`}
            >
              {row.stale ? "Unverified" : row.status}
            </span>
          </div>
          <dl>
            <div>
              <dt>Health</dt>
              <dd>
                {row.health === null ? "Not reported" : `${row.health}/100`}
              </dd>
            </div>
            <div>
              <dt>Queue</dt>
              <dd>{row.queue ?? "Not reported"}</dd>
            </div>
            <div>
              <dt>{row.kpiName ?? "KPI"}</dt>
              <dd>{row.kpiValue ?? "Not reported"}</dd>
            </div>
          </dl>
          <p>{row.currentWork ?? "No current work reported"}</p>
          <small>
            {row.source ?? "Awaiting telemetry"}
            {row.observedAt ? ` · ${row.observedAt}` : ""}
            {row.stale && row.observedAt ? " · Stale" : ""}
          </small>
        </article>
      ))}
    </div>
  );
}
