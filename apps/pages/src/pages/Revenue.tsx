import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import { AsyncState, EmptyState } from "../components/AsyncState";
import { RefreshControl } from "../components/RefreshControl";
import { money } from "../types";
const load = (signal?: AbortSignal) =>
  api<{
    currencies: {
      currency: string;
      paidMinor: number;
      refundedMinor: number;
      paidOrders: number;
    }[];
    reportedMonthlyUsd: number;
    sampledAt: string;
  }>("/api/revenue", { signal });
export default function Revenue() {
  const state = useApi(load, 15000);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PORTFOLIO INTELLIGENCE</div>
          <h1>
            Revenue<span className="title-dot">.</span>
          </h1>
          <p>Verified marketplace orders and reported portfolio revenue.</p>
        </div>
        <RefreshControl {...state} />
      </div>
      <AsyncState {...state} retry={state.reload} />
      {state.data && (
        <>
          <section className="panel">
            <h2>Marketplace payments</h2>
            {!state.data.currencies.length ? (
              <EmptyState>No marketplace orders recorded yet.</EmptyState>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Currency</th>
                      <th>Paid amount · minor units</th>
                      <th>Refunded · minor units</th>
                      <th>Paid orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.data.currencies.map((r) => (
                      <tr key={r.currency}>
                        <td>{r.currency}</td>
                        <td>{r.paidMinor.toLocaleString()}</td>
                        <td>{r.refundedMinor.toLocaleString()}</td>
                        <td>{r.paidOrders}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="muted">
              All-time settled order amounts, excluding pending orders.
              Currencies are kept separate. Figures update when orders are
              reconciled with the payment provider.
            </p>
          </section>
          <section className="panel">
            <h2>Reported monthly portfolio revenue</h2>
            <strong>{money(state.data.reportedMonthlyUsd)}</strong>
            <p className="muted">
              Existing reported USD inputs; separate from verified marketplace
              payments.
            </p>
          </section>
        </>
      )}
    </>
  );
}
