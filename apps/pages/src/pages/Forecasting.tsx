import { useCallback, useState } from "react";
import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import { AsyncState } from "../components/AsyncState";
import type { revenueScenarios } from "../../../../portal-os/universe";
import { money } from "../types";
export default function Forecasting() {
  const [growth, setGrowth] = useState(0);
  const [months, setMonths] = useState(3);
  const load = useCallback(
    (signal: AbortSignal) =>
      api<ReturnType<typeof revenueScenarios>>(
        `/api/intelligence/forecasts?months=${months}&growth=${growth}`,
        { signal },
      ),
    [months, growth],
  );
  const state = useApi(load);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PORTAL INTELLIGENCE V2</div>
          <h1>
            Forecasting<span className="title-dot">.</span>
          </h1>
          <p>Explore what comes next. Make your assumptions explicit.</p>
        </div>
        <span className="subtle-badge">Scenario planner</span>
      </div>
      <div className="filter-toolbar forecast-controls">
        <label>
          Monthly growth assumption: {growth}%
          <input
            type="range"
            min="-20"
            max="30"
            value={growth}
            onChange={(e) => setGrowth(Number(e.target.value))}
          />
        </label>
        <label>
          Horizon
          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
          >
            <option value="3">3 months</option>
            <option value="6">6 months</option>
            <option value="12">12 months</option>
          </select>
        </label>
      </div>
      <AsyncState {...state} retry={state.reload} />
      {state.data && (
        <>
          <div className="portfolio-summary">
            <div>
              <strong>{money(state.data.totals.current)}</strong>
              <span>Current reported monthly USD</span>
            </div>
            <div>
              <strong>{money(state.data.totals.scenario)}</strong>
              <span>Monthly revenue scenario at month {months}</span>
            </div>
            <div>
              <strong>
                {state.data.observedGrowthPct === null
                  ? "—"
                  : `${state.data.observedGrowthPct}%`}
              </strong>
              <span>Observed revenue change · ≥7 day history</span>
            </div>
          </div>
          <section className="panel">
            <h2>Revenue scenarios by division</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Division</th>
                    <th>Current</th>
                    <th>Conservative (−5%/mo)</th>
                    <th>Your scenario ({growth}%/mo)</th>
                    <th>Optimistic (+10%/mo)</th>
                  </tr>
                </thead>
                <tbody>
                  {state.data.divisions.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <strong>{d.name}</strong>
                      </td>
                      <td>{money(d.current)}</td>
                      <td>{money(d.conservative)}</td>
                      <td>{money(d.scenario)}</td>
                      <td>{money(d.optimistic)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted">
              {state.data.method} No new product revenue is assumed.
            </p>
          </section>
        </>
      )}
    </>
  );
}
