import { getHealth } from "../api/operations";
import { useApi } from "../hooks/useApi";
import { AsyncState } from "./AsyncState";
export function SystemStatus() {
  const state = useApi(getHealth, 15000);
  return (
    <section className="panel">
      <h2>Runtime & ecosystem services</h2>
      <AsyncState {...state} retry={state.reload} />
      {state.data?.services.map((s) => (
        <div className="stat-row" key={s.name}>
          <span>{s.name}</span>
          <strong>{s.status}</strong>
        </div>
      ))}
    </section>
  );
}
