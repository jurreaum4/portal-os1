import { getSystemHealth } from "../api/console";
import { useApi } from "../hooks/useApi";
import { AsyncState } from "./AsyncState";
export function SystemHealth() {
  const state = useApi(getSystemHealth, 30000);
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <div className="eyebrow">INFRASTRUCTURE</div>
          <h2>System health</h2>
        </div>
        <span className="muted">Checks every 30 seconds</span>
      </div>
      <AsyncState {...state} retry={state.reload} />
      <div className="health-grid">
        {state.data?.checks.map((check) => (
          <div className="health-check" key={check.name}>
            <span className={`signal-status ${check.status}`}>
              {check.status}
            </span>
            <h3>{check.name}</h3>
            <p>{check.detail}</p>
          </div>
        ))}
      </div>
      {state.data && (
        <small className="muted">
          Checked {new Date(state.data.checkedAt).toLocaleTimeString("en-GB")}
        </small>
      )}
    </section>
  );
}
