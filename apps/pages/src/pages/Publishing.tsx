import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import { AsyncState, EmptyState } from "../components/AsyncState";
import { RefreshControl } from "../components/RefreshControl";
interface Release {
  productId: string;
  name: string;
  stage: string;
  runId: string | null;
  status: string | null;
  message: string | null;
  slug: string | null;
  publishedAt: string | null;
}
const load = (signal?: AbortSignal) =>
  api<Release[]>("/api/publishing", { signal });
export default function Publishing() {
  const state = useApi(load, 15000);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">RELEASE OPERATIONS</div>
          <h1>
            Publishing<span className="title-dot">.</span>
          </h1>
          <p>
            Verified packages, governor decisions and automated publication.
          </p>
        </div>
        <RefreshControl {...state} />
      </div>
      <AsyncState {...state} retry={state.reload} />
      <section className="panel">
        <h2>Release queue</h2>
        {state.data?.length === 0 && (
          <EmptyState>No packaged or published products yet.</EmptyState>
        )}
        {state.data?.map((r) => (
          <Link
            key={r.runId ?? r.productId}
            className="factory-run"
            to={`/products/${encodeURIComponent(r.productId)}`}
          >
            <div>
              <strong>{r.name}</strong>
              <p>
                {r.message ?? "Legacy product — no automated release evidence"}
              </p>
              {r.publishedAt && (
                <small>
                  Published{" "}
                  {new Date(
                    r.publishedAt.replace(" ", "T") + "Z",
                  ).toLocaleDateString("en-GB")}
                </small>
              )}
            </div>
            <span className="badge">
              {r.stage} · {r.status ?? "Recorded"}
            </span>
          </Link>
        ))}
      </section>
    </>
  );
}
