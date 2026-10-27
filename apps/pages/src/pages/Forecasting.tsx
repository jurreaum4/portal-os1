import { useState } from "react";
import { getForecasts } from "../api/operations";
import { useApi } from "../hooks/useApi";
import { AsyncState } from "../components/AsyncState";
import { money } from "../types";
export default function Forecasting() {
  const state = useApi(getForecasts);
  const [growth, setGrowth] = useState(5);
  const [months, setMonths] = useState(3);
  const revenue = state.data?.divisions.reduce((s, d) => s + d.revenue, 0) ?? 0;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PORTAL INTELLIGENCE</div>
          <h1>
            Forecasting<span className="title-dot">.</span>
          </h1>
          <p>Explore what comes next. Make your assumptions explicit.</p>
        </div>
        <span className="subtle-badge">Scenario planner</span>
      </div>
      <AsyncState {...state} retry={state.reload} />
      {state.data && (
        <>
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
          <div className="portfolio-summary">
            <div>
              <strong>{money(revenue)}</strong>
              <span>Current monthly revenue</span>
            </div>
            <div>
              <strong>{money(revenue * (1 + growth / 100) ** months)}</strong>
              <span>Projected monthly revenue at month {months}</span>
            </div>
            <div>
              <strong>
                {state.data.divisions.reduce((s, d) => s + d.ready, 0)}
              </strong>
              <span>Products at Ready</span>
            </div>
          </div>
          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>Revenue scenarios by division</h2>
                <p>
                  Monthly revenue in USD at month {months}. No new product
                  revenue is assumed.
                </p>
              </div>
            </div>
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
                      <td>{money(d.revenue)}</td>
                      <td>{money(d.revenue * 0.95 ** months)}</td>
                      <td className="forecast-value">
                        {money(d.revenue * (1 + growth / 100) ** months)}
                      </td>
                      <td>{money(d.revenue * 1.1 ** months)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted">
              Scenario estimates use reported revenue and compound growth
              assumptions. Historical revenue and predictive models are not
              available.
            </p>
          </section>
        </>
      )}
    </>
  );
}
