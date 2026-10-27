import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { MarketplaceOperations as Data } from "../api/universe";
import { useApi } from "../hooks/useApi";
import { AsyncState } from "../components/AsyncState";
const load = (signal?: AbortSignal) =>
  api<Data>("/api/marketplace/operations", { signal });
export default function MarketplaceOperations() {
  const state = useApi(load, 15000);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MARKETPLACE OPERATIONS</div>
          <h1>
            Made. Released. Discovered<span className="title-dot">.</span>
          </h1>
          <p>
            Products, creators, purchases, libraries and download analytics.
          </p>
        </div>
        <Link to="/portal/publishing">Publishing queue ↗</Link>
      </div>
      <AsyncState {...state} retry={state.reload} />
      {state.data && (
        <>
          <p className="muted">{state.data.source}</p>
          <section className="panel">
            <h2>Product analytics</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Type</th>
                    <th>Release status</th>
                    <th>Downloads</th>
                    <th>Paid/free acquisitions</th>
                    <th>Library entitlements</th>
                    <th>Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {state.data.products.map((p) => (
                    <tr key={p.releaseId}>
                      <td>
                        <Link
                          to={`/portal/products/${encodeURIComponent(p.id)}/twin`}
                        >
                          {p.name}
                        </Link>
                      </td>
                      <td>{p.type}</td>
                      <td>{p.withdrawnAt ? "Withdrawn" : "Published"}</td>
                      <td>{p.downloads}</td>
                      <td>{p.paidOrders}</td>
                      <td>{p.libraries}</td>
                      <td>{p.rating ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!state.data.products.length && (
              <p>No verified marketplace releases yet.</p>
            )}
          </section>
          <div className="analytics-grid">
            <section className="panel">
              <h2>Creator analytics</h2>
              {state.data.creators.map((c) => (
                <div className="stat-row" key={c.id}>
                  <strong>{c.name}</strong>
                  <span>
                    {c.releases} releases · {c.downloads} download grants
                  </span>
                </div>
              ))}
              {!state.data.creators.length && <p>No published creators yet.</p>}
            </section>
            <section className="panel">
              <h2>Revenue analytics · minor units</h2>
              {state.data.currencies.map((r, i) => (
                <div className="stat-row" key={i}>
                  <span>
                    {r.productId} · {r.currency}
                  </span>
                  <strong>
                    {r.paidMinor} settled · {r.refundedMinor} refunded
                  </strong>
                </div>
              ))}
              {!state.data.currencies.length && (
                <p>No marketplace payments recorded.</p>
              )}
              <p className="muted">
                Currencies remain separate. Download grants count authorised
                URLs issued, rather than completed file transfers.
              </p>
            </section>
          </div>
        </>
      )}
    </>
  );
}
