import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getApprovals, approve, reject, override } from "../api/approvals";
import { AsyncState, EmptyState } from "../components/AsyncState";
import { ApprovalCard } from "../components/ApprovalCard";
import { RefreshControl } from "../components/RefreshControl";
import { useApi } from "../hooks/useApi";
import { useGovernor } from "../layouts/GovernorLayout";
export default function Approvals() {
  const state = useApi(getApprovals);
  const { token } = useGovernor();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState("all");
  const [risk, setRisk] = useState("all");
  const [selectedId, setSelectedId] = useState<string>();
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const productId = params.get("product");
  const visible = (state.data ?? []).filter(
    (approval) =>
      (!productId || productId === approval.productId) &&
      (priority === "all" || approval.priority === priority) &&
      (risk === "all" || approval.risk === risk) &&
      `${approval.project} ${approval.action} ${approval.id}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const selected =
    visible.find((approval) => approval.id === selectedId) ?? visible[0];
  const clear = () => {
    setQuery("");
    setPriority("all");
    setRisk("all");
    setParams({});
  };
  async function decide(action: "approve" | "reject" | "override") {
    if (!selected || pending || state.refreshing) return;
    const request = selected;
    setPending(request.id);
    setError("");
    setMessage("");
    try {
      await (action === "override"
        ? override(request.id, token, reason)
        : (action === "approve" ? approve : reject)(request.id, token));
      setMessage(
        `${request.project}: ${request.action} request ${action === "approve" ? "approved" : action === "override" ? "overridden" : "rejected"}.`,
      );
      setReason("");
      state.reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Decision could not be saved",
      );
      state.reload();
    } finally {
      setPending(null);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ICVS GOVERNANCE</div>
          <h1>
            Approval centre<span className="title-dot">.</span>
          </h1>
          <p>Inspect each request and decide what moves forward.</p>
        </div>
        <RefreshControl {...state} />
      </div>
      {!token && (
        <p className="notice">
          You can review requests. Add your governor token in{" "}
          <Link to="/settings">Settings</Link> to approve or reject them.
        </p>
      )}
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <AsyncState {...state} retry={state.reload} />
      {state.data && (
        <>
          <div className="portfolio-summary approval-summary">
            <div>
              <strong>{state.data.length}</strong>
              <span>Pending requests</span>
            </div>
            <div>
              <strong>
                {
                  state.data.filter((approval) => approval.priority === "High")
                    .length
                }
              </strong>
              <span>High priority</span>
            </div>
            <div>
              <strong>
                {
                  state.data.filter((approval) => approval.risk === "High")
                    .length
                }
              </strong>
              <span>High risk</span>
            </div>
          </div>
          <div className="filter-toolbar">
            <label>
              Search requests
              <input
                type="search"
                placeholder="Project, action, or request ID"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label>
              Priority
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              >
                <option value="all">All priorities</option>
                {["High", "Medium", "Low"].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Risk
              <select
                value={risk}
                onChange={(event) => setRisk(event.target.value)}
              >
                <option value="all">All risk levels</option>
                {["High", "Medium", "Low"].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="results-line">
            <span role="status">
              {visible.length} of {state.data.length} pending requests
              {productId ? " · product filter active" : ""}
            </span>
            {(query || priority !== "all" || risk !== "all" || productId) && (
              <button className="text-button" onClick={clear}>
                Clear filters
              </button>
            )}
          </div>
          {!state.data.length ? (
            <EmptyState>No pending approvals. You’re all caught up.</EmptyState>
          ) : !visible.length ? (
            <EmptyState>
              No requests match your filters.{" "}
              <button onClick={clear}>Clear filters</button>
            </EmptyState>
          ) : (
            <div className="approval-workspace">
              <div className="approval-list">
                {visible.map((approval) => (
                  <ApprovalCard
                    key={approval.id}
                    approval={approval}
                    selected={approval.id === selected?.id}
                    onReview={() => {
                      setSelectedId(approval.id);
                      setReason("");
                    }}
                  />
                ))}
              </div>
              {selected && (
                <section
                  id="request-review"
                  className="panel request-review"
                  aria-label="Request review"
                >
                  <div className="eyebrow">REQUEST {selected.id}</div>
                  <h2>{selected.project}</h2>
                  <p>
                    Review the requested action before recording your decision.
                  </p>
                  <dl>
                    <div>
                      <dt>Action</dt>
                      <dd>{selected.action}</dd>
                    </div>
                    <div>
                      <dt>Priority</dt>
                      <dd>
                        <span
                          className={`priority-tag ${selected.priority.toLowerCase()}`}
                        >
                          {selected.priority}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt>Risk</dt>
                      <dd>
                        <span
                          className={`risk-tag ${selected.risk.toLowerCase()}`}
                        >
                          {selected.risk}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>Pending decision</dd>
                    </div>
                  </dl>
                  <Link
                    className="back-link"
                    to={`/products/${encodeURIComponent(selected.productId)}`}
                  >
                    View product details ↗
                  </Link>
                  <div className="button-group">
                    <button
                      className="primary"
                      disabled={!token || pending !== null || state.refreshing}
                      onClick={() => void decide("approve")}
                    >
                      {pending === selected.id ? "Saving…" : "Approve request"}
                    </button>
                    <button
                      disabled={!token || pending !== null || state.refreshing}
                      onClick={() => void decide("reject")}
                    >
                      Reject request
                    </button>
                  </div>
                  <label className="stacked-label">
                    Override reason
                    <input
                      value={reason}
                      maxLength={1000}
                      placeholder="Explain the exception (10+ characters)"
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                  <button
                    disabled={
                      !token ||
                      pending !== null ||
                      state.refreshing ||
                      reason.trim().length < 10
                    }
                    onClick={() => void decide("override")}
                  >
                    Override request
                  </button>
                  <p className="decision-note">
                    Decisions are final for this request. Approval records your
                    intent; it does not publish the product.
                  </p>
                </section>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
