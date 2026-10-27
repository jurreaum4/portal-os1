import { Link } from "react-router-dom";
import { useState } from "react";
import { api } from "../api/client";
import { API_URL } from "../api/client";
import { useGovernor } from "../layouts/GovernorLayout";
export default function Settings() {
  const { token, setToken } = useGovernor();
  const [draft, setDraft] = useState(token);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR CONTROL ROOM</div>
          <h1>
            Settings<span className="title-dot">.</span>
          </h1>
          <p>Manage your connection and governor access.</p>
        </div>
      </div>
      <section className="panel settings-panel">
        <h2>Worker connection</h2>
        <p className="muted">
          This workspace connects to the API configured at build time.
        </p>
        <code className="endpoint">
          {API_URL || "Same-origin Worker proxy"}
        </code>
        <h2 className="subheading">Governor access</h2>
        <p className="muted">
          Enter the governor token to approve, reject or override requests. It
          stays in memory for this tab and clears on reload.
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            setSaved(false);
            try {
              await api("/api/session", {
                method: "POST",
                headers: { Authorization: `Bearer ${draft.trim()}` },
              });
              setToken(draft.trim());
              setDraft("");
              setSaved(true);
            } catch (cause) {
              setError(
                cause instanceof Error ? cause.message : "Sign-in failed",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label htmlFor="token">Governor token</label>
          <input
            id="token"
            type="password"
            autoComplete="off"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setSaved(false);
            }}
          />
          <div className="button-group">
            <button
              className="primary"
              type="submit"
              disabled={busy || !draft.trim()}
            >
              {busy ? "Verifying…" : "Sign in"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setToken("");
                setDraft("");
                setSaved(false);
              }}
            >
              Clear access
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
          {saved && (
            <p role="status">
              Governor access verified. <Link to="/">Return to console</Link>
            </p>
          )}
          <span className="access-state">
            {token
              ? "Governor token is set for this tab."
              : "Read access only."}
          </span>
        </form>
      </section>
    </>
  );
}
