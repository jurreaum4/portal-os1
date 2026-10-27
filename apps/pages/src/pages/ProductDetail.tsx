import { useGovernor } from "../layouts/GovernorLayout";
import { api } from "../api/client";
import { useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getOutputs, getDivisions, getTransitions } from "../api/operations";
import { money } from "../types";
import { getProduct } from "../api/products";
import { AsyncState } from "../components/AsyncState";
import { useApi } from "../hooks/useApi";
export default function ProductDetail() {
  const { id = "" } = useParams();
  const { token } = useGovernor();
  const loadIdentity = useCallback(
    (signal: AbortSignal) =>
      api<{ role: string }>("/api/icv/me", {
        signal,
        headers: { Authorization: `Bearer ${token}` },
      }),
    [token],
  );
  const identity = useApi(loadIdentity);
  const [reverseEvent, setReverseEvent] = useState("");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState("");
  const [reversing, setReversing] = useState(false);
  const load = useCallback(
    (signal: AbortSignal) => getProduct(id, signal),
    [id],
  );
  const state = useApi(load, 15000);
  const loadOutputs = useCallback(
    (signal: AbortSignal) => getOutputs(id, signal),
    [id],
  );
  const outputs = useApi(loadOutputs, 15000);
  const loadTransitions = useCallback(
    (signal: AbortSignal) => getTransitions(id, signal),
    [id],
  );
  const transitions = useApi(loadTransitions, 15000);
  const divisions = useApi(getDivisions);
  return (
    <>
      <Link className="back-link" to="/products">
        ← All products
      </Link>
      <AsyncState {...state} retry={state.reload} />
      {state.data && (
        <>
          <div className="page-heading">
            <div>
              <div className="eyebrow">PRODUCT OVERVIEW</div>
              <h1>
                {state.data.name}
                <span className="title-dot">.</span>
              </h1>
              <p>{state.data.description || "No description yet."}</p>
            </div>
            <span className={`badge ${state.data.stage.toLowerCase()}`}>
              {state.data.stage}
            </span>
          </div>
          <section className="panel detail-panel">
            <h2>Product details</h2>
            <dl>
              <div>
                <dt>Division</dt>
                <dd>
                  {divisions.data?.find((d) => d.id === state.data?.divisionId)
                    ?.name ?? state.data.divisionId}
                </dd>
              </div>
              <div>
                <dt>Monthly revenue (USD)</dt>
                <dd>{money(state.data.revenue)}</dd>
              </div>
              <div>
                <dt>Product health</dt>
                <dd>{state.data.status}</dd>
              </div>
              <div>
                <dt>Portfolio score</dt>
                <dd>{state.data.score} / 100</dd>
              </div>
              <div>
                <dt>Stage</dt>
                <dd>{state.data.stage}</dd>
              </div>
              <div>
                <dt>Product ID</dt>
                <dd>{state.data.id}</dd>
              </div>
              <div>
                <dt>Updated (UTC)</dt>
                <dd>{state.data.updatedAt}</dd>
              </div>
            </dl>
            <Link
              className="button"
              to={`/approvals?product=${encodeURIComponent(id)}`}
            >
              Review approval queue →
            </Link>
          </section>
          <section className="panel output-panel">
            <h2>Lifecycle history</h2>
            <AsyncState {...transitions} retry={transitions.reload} />
            {transitions.data?.length === 0 && (
              <p className="muted">No automation transitions recorded.</p>
            )}
            {identity.data?.role === "governor" &&
              !!transitions.data?.length && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setReversing(true);
                    setResult("");
                    try {
                      await api(
                        `/api/factory/${encodeURIComponent(id)}/override`,
                        {
                          method: "POST",
                          headers: {
                            Authorization: `Bearer ${token}`,
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({
                            eventId: reverseEvent,
                            expectedSequence:
                              transitions.data!.at(-1)!.sequence,
                            reason,
                          }),
                        },
                      );
                      setResult(
                        "Override queued. Compensation and restored progression will appear in the audit trail.",
                      );
                      transitions.reload();
                      state.reload();
                    } catch (e) {
                      setResult(
                        e instanceof Error ? e.message : "Override failed",
                      );
                    } finally {
                      setReversing(false);
                    }
                  }}
                >
                  <h3>Override lifecycle</h3>
                  <p>
                    Restore the checkpoint before a transition. Execution
                    effects require confirmed compensation. Automation then
                    resumes using fresh operation IDs; history and final
                    decisions remain intact.
                  </p>
                  <label htmlFor="reverse-event">Transition to reverse</label>
                  <select
                    id="reverse-event"
                    required
                    value={reverseEvent}
                    onChange={(e) => setReverseEvent(e.target.value)}
                  >
                    <option value="">Select transition</option>
                    {transitions.data
                      .filter(
                        (e) =>
                          ![
                            "Workflow",
                            "Resource Allocation",
                            "Reversal",
                          ].includes(e.engine),
                      )
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.sequence}: {e.fromStage ?? "Intake"} → {e.toStage}{" "}
                          ({e.engine})
                        </option>
                      ))}
                  </select>
                  <label htmlFor="reverse-reason">Override reason</label>
                  <input
                    id="reverse-reason"
                    required
                    minLength={10}
                    maxLength={1000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <button disabled={reversing}>Override</button>
                  {result && <p role="status">{result}</p>}
                </form>
              )}
            {transitions.data?.map((event) => (
              <details key={event.id}>
                <summary>
                  {event.fromStage ?? "Intake"} → {event.toStage} ·{" "}
                  {event.engine}
                </summary>
                <p>{event.reason}</p>
                <p className="muted">
                  {event.actor} · {event.createdAt} · Event {event.sequence}
                </p>
                <pre>{event.evidence}</pre>
              </details>
            ))}
          </section>
          <section className="panel output-panel">
            <h2>Factory outputs</h2>
            <AsyncState {...outputs} retry={outputs.reload} />
            {outputs.data?.length === 0 && (
              <p className="muted">
                No outputs yet. Automation starts after intake.
              </p>
            )}
            {outputs.data?.map((o) => (
              <details key={o.id}>
                <summary>{o.engine} output</summary>
                <pre>{o.content}</pre>
              </details>
            ))}
            <Link className="button" to="/orchestration">
              Open product factory →
            </Link>
          </section>
        </>
      )}
    </>
  );
}
