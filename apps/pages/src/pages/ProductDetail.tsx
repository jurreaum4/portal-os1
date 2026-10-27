import { getConsole } from "../api/console";
import { Money } from "../components/Intelligence";
import { useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { getProduct } from "../api/products";
import { AsyncState } from "../components/AsyncState";
import { useApi } from "../hooks/useApi";
export default function ProductDetail() {
  const { id = "" } = useParams();
  const load = useCallback(
    (signal: AbortSignal) => getProduct(id, signal),
    [id],
  );
  const state = useApi(load, 15000);
  const consoleState = useApi(getConsole, 15000);
  const observation = consoleState.data?.products.find((p) => p.id === id);
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
          <AsyncState {...consoleState} retry={consoleState.reload} />
          {observation && (
            <section className="panel detail-panel">
              <h2>Operational observations</h2>
              <dl>
                <div>
                  <dt>Division</dt>
                  <dd>{observation.unit ?? "Unassigned"}</dd>
                </div>
                <div>
                  <dt>Factory stage</dt>
                  <dd>{observation.factoryStage ?? "Unclassified"}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{observation.status ?? "Not reported"}</dd>
                </div>
                <div>
                  <dt>Health</dt>
                  <dd>
                    {observation.health === null
                      ? "Not reported"
                      : `${observation.health}/100`}
                  </dd>
                </div>
                <div>
                  <dt>Revenue</dt>
                  <dd>
                    <Money
                      minor={observation.revenueMinor}
                      currency={observation.currency}
                    />{" "}
                    {observation.revenuePeriod}
                  </dd>
                </div>
                <div>
                  <dt>Forecast</dt>
                  <dd>
                    {observation.forecast ?? "Not reported"}{" "}
                    {observation.forecastDueAt}
                  </dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{observation.source ?? "No observation"}</dd>
                </div>
                <div>
                  <dt>Observed at</dt>
                  <dd>
                    {observation.observedAt ?? "Not reported"}
                    {observation.stale && observation.observedAt
                      ? " · Stale"
                      : ""}
                  </dd>
                </div>
              </dl>
            </section>
          )}
        </>
      )}
    </>
  );
}
