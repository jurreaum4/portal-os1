import { useCallback } from "react";
import { getAutomationProject } from "../api/automation";
import { useApi } from "../hooks/useApi";
import { AsyncState } from "./AsyncState";
export function AutomationProject({
  id,
  managed,
}: {
  id: string;
  managed: boolean;
}) {
  const load = useCallback(
    (signal: AbortSignal) =>
      managed ? getAutomationProject(id, signal) : Promise.resolve(null),
    [id, managed],
  );
  const state = useApi(load, 15000);
  if (!managed) return null;
  return (
    <section className="panel">
      <h2>Automation record</h2>
      <AsyncState {...state} retry={state.reload} />
      {state.data && (
        <>
          <p>
            {state.data.workflow.stage} ·{" "}
            {state.data.workflow.status.replaceAll("_", " ")} · Generation{" "}
            {state.data.workflow.generation} · Version{" "}
            {state.data.workflow.version}
          </p>
          <p>{state.data.workflow.reason}</p>
          <h3>Planning packages</h3>
          {state.data.artifacts.map((a) => (
            <details className="artifact-details" key={a.id}>
              <summary>
                {a.kind} · Generation {a.generation} · {a.created_at}
              </summary>
              <pre>{JSON.stringify(a.content, null, 2)}</pre>
            </details>
          ))}
          <h3>Execution and evidence</h3>
          {state.data.jobs.map((j) => (
            <div className="signal-row" key={j.id}>
              <div>
                <strong>
                  {j.stage} · {j.department} · {j.status}
                </strong>
                <p>
                  Generation {j.generation} · Attempt {j.attempt} ·{" "}
                  {j.worker_id ?? "Awaiting worker"}
                </p>
                {j.result && (
                  <pre>{JSON.stringify(JSON.parse(j.result), null, 2)}</pre>
                )}
              </div>
            </div>
          ))}
          <h3>Project audit</h3>
          <div className="automation-audit">
            {state.data.events.map((e) => (
              <details className="artifact-details" key={e.id}>
                <summary>
                  {e.kind} · {e.action} · {e.occurred_at}
                </summary>
                <p>
                  {e.from_state ? `${e.from_state} → ` : ""}
                  {e.to_state}
                </p>
                <pre>{JSON.stringify(JSON.parse(e.details), null, 2)}</pre>
              </details>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
