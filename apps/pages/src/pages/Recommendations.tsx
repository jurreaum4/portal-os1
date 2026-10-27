import { Link } from "react-router-dom";
import { getRecommendations } from "../api/operations";
import { useApi } from "../hooks/useApi";
import { AsyncState, EmptyState } from "../components/AsyncState";
import { RefreshControl } from "../components/RefreshControl";
export default function Recommendations() {
  const state = useApi(getRecommendations, 15000);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PORTFOLIO INTELLIGENCE</div>
          <h1>
            Recommendations<span className="title-dot">.</span>
          </h1>
          <p>Rule-based next steps from recorded portfolio evidence.</p>
        </div>
        <RefreshControl {...state} />
      </div>
      <AsyncState {...state} retry={state.reload} />
      <section className="panel">
        {state.data?.length === 0 && (
          <EmptyState>No recommendations at present.</EmptyState>
        )}
        {state.data?.map((r) => (
          <Link
            className="recommendation"
            to={`/products/${encodeURIComponent(r.productId)}`}
            key={r.id}
          >
            <div>
              <strong>{r.name}</strong>
              <p>{r.reason}</p>
              <span className="badge">
                {r.priority} priority · score {r.score}/100
              </span>
            </div>
          </Link>
        ))}
      </section>
    </>
  );
}
