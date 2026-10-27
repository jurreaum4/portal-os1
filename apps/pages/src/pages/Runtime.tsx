import { SystemHealth } from "../components/SystemHealth";
import { useState } from "react";
import { Link } from "react-router-dom";
import { getTelemetry } from "../api/analytics";
import { useApi } from "../hooks/useApi";
import { AsyncState } from "../components/AsyncState";
import { RefreshControl } from "../components/RefreshControl";
import { ProcessStates } from "../components/ProcessStates";
import { MetricTile } from "../components/MetricTile";
export default function Runtime() {
  const [automatic, setAutomatic] = useState(true);
  const state = useApi(getTelemetry, automatic ? 15000 : 0);
  const total = state.data?.reduce((sum, row) => sum + row.count, 0) ?? 0;
  const count = (...states: string[]) =>
    state.data
      ?.filter((row) => states.includes(row.state))
      .reduce((sum, row) => sum + row.count, 0) ?? 0;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ICVS OPERATIONS</div>
          <h1>
            Runtime monitoring<span className="title-dot">.</span>
          </h1>
          <p>Monitor process states and identify where attention is needed.</p>
        </div>
        <RefreshControl {...state} />
      </div>
      <SystemHealth />
      <div className="monitor-toolbar">
        <label className="toggle">
          <input
            type="checkbox"
            checked={automatic}
            onChange={(event) => setAutomatic(event.target.checked)}
          />{" "}
          Refresh every 15 seconds
        </label>
        <span>
          Stored process states ·{" "}
          {automatic ? "Automatic refresh enabled" : "Automatic refresh paused"}
        </span>
      </div>
      <AsyncState {...state} retry={state.reload} />
      {state.data && (
        <>
          <div className="summary-grid">
            <MetricTile
              title="Total processes"
              value={total}
              detail="Across all reported states"
              icon="◫"
            />
            <MetricTile
              title="Running"
              value={count("RUNNING")}
              detail="Processes executing"
              icon="⇢"
            />
            <MetricTile
              title="Panicked"
              value={count("PANICKED")}
              detail="Processes requiring attention"
              icon="!"
            />
            <MetricTile
              title="Suspended"
              value={count("SUSPENDED")}
              detail="Processes currently suspended"
              icon="Ⅱ"
            />
          </div>
          {count("PANICKED") > 0 && (
            <p className="notice error" role="status">
              {count("PANICKED")} panicked processes need attention. Review
              orchestration context before taking action.
            </p>
          )}
          <div className="analytics-grid">
            <section className="panel">
              <h2>Process distribution</h2>
              <ProcessStates rows={state.data} />
            </section>
            <section className="panel">
              <h2>Runtime context</h2>
              <p>
                These counts show the latest stored process states. They do not
                indicate heartbeat freshness or individual process activity.
              </p>
              <div className="stat-row">
                <span>Ready</span>
                <strong>{count("READY")}</strong>
              </div>
              <div className="stat-row">
                <span>Terminated</span>
                <strong>{count("TERMINATED")}</strong>
              </div>
              <Link className="button" to="/orchestration">
                Open orchestration →
              </Link>
            </section>
          </div>
        </>
      )}
    </>
  );
}
