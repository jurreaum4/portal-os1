import { Link } from "react-router-dom";
import type { ConsoleSnapshot } from "../../../console-contract";
import { EmptyState } from "./AsyncState";
export function Intelligence({
  data,
  unitId,
}: {
  data: ConsoleSnapshot;
  unitId?: string;
}) {
  const recommendations = data.recommendations.filter(
    (r) =>
      !unitId ||
      data.products.some((p) => p.id === r.productId && p.unitId === unitId),
  );
  const forecasts = data.forecasts.filter(
    (r) =>
      !unitId ||
      data.products.some((p) => p.id === r.productId && p.unitId === unitId),
  );
  return (
    <div className="intelligence-grid">
      <section className="panel">
        <div className="eyebrow">NEXT BEST ACTION</div>
        <h2>Recommendations & opportunities</h2>
        <p className="muted">
          Evidence-based signals from recorded scores and workflow states.
        </p>
        {!recommendations.length && (
          <EmptyState>No actionable signals in the current data.</EmptyState>
        )}
        {recommendations.map((r) => (
          <Link
            key={r.productId}
            className="signal-row"
            to={`/products/${encodeURIComponent(r.productId)}`}
          >
            <span className="signal-icon">↗</span>
            <div>
              <span className="eyebrow">{r.kind}</span>
              <h3>{r.title}</h3>
              <p>{r.reason}</p>
            </div>
            <span>→</span>
          </Link>
        ))}
      </section>
      <section className="panel">
        <div className="eyebrow">LOOKING AHEAD</div>
        <h2>Forecasts</h2>
        <p className="muted">
          Reported by connected systems; estimates are not guarantees.
        </p>
        {!forecasts.length && (
          <EmptyState>
            No forecasts reported yet. Forecasts appear when an integration
            supplies an observation.
          </EmptyState>
        )}
        {forecasts.map((f) => (
          <div className="signal-row" key={f.productId}>
            <div>
              <Link to={`/products/${encodeURIComponent(f.productId)}`}>
                <h3>{f.name}</h3>
              </Link>
              <p>{f.forecast}</p>
              <small>
                {f.dueAt ? `Target ${f.dueAt} · ` : ""}
                {f.source} · {f.observedAt}
                {f.stale ? " · Stale observation" : ""}
              </small>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
export function Money({
  minor,
  currency,
}: {
  minor: number | null;
  currency: string | null;
}) {
  if (minor === null || !currency) return <>Not reported</>;
  const formatter = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    currencyDisplay: "code",
  });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return <>{formatter.format(minor / 10 ** digits)}</>;
}
