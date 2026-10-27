import { useState } from "react";
import { getDivisions, mutate } from "../api/operations";
import { useApi } from "../hooks/useApi";
import { AsyncState } from "../components/AsyncState";
import { API_URL } from "../api/client";
import { useGovernor } from "../layouts/GovernorLayout";
export default function Settings() {
  const { token, setToken } = useGovernor();
  const [draft, setDraft] = useState(token);
  const divisions = useApi(getDivisions);
  const [divisionName, setDivisionName] = useState("");
  const [divisionError, setDivisionError] = useState("");
  const [creating, setCreating] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR CONTROL ROOM</div>
          <h1>
            Settings<span className="title-dot">.</span>
          </h1>
          <p>Manage your connection and Universe access.</p>
        </div>
      </div>
      <section className="panel settings-panel">
        <h2>Worker connection</h2>
        <p className="muted">
          This workspace connects to the API configured at build time.
        </p>
        <code className="endpoint">
          {API_URL || "Same-origin API /api (local Vite proxy → Worker)"}
        </code>
        <h2 className="subheading">Universe access</h2>
        <p className="muted">
          Use an ICV member credential for your Marketplace library, a viewer
          credential to explore the Universe, or a governor credential to
          approve, reject and override. Credentials stay in memory for this tab
          and clear on reload.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setToken(draft.trim());
            setDraft("");
            setSaved(true);
          }}
        >
          <label htmlFor="token">Access token</label>
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
            <button className="primary" type="submit">
              Save access
            </button>
            <button
              type="button"
              onClick={() => {
                setToken("");
                setDraft("");
                setSaved(false);
              }}
            >
              Clear access
            </button>
          </div>
          {saved && <p role="status">Access updated.</p>}
          <span className="access-state">
            {token
              ? "Access credential is set for this tab."
              : "Legacy public views only; Universe access is not connected."}
          </span>
        </form>
      </section>
      <section className="panel settings-panel division-settings">
        <h2>Divisions</h2>
        <p className="muted">
          Your ecosystem can grow. Add a division to make it available for
          product intake and portfolio management.
        </p>
        <AsyncState {...divisions} retry={divisions.reload} />
        {divisions.data?.map((d) => (
          <div className="stat-row" key={d.id}>
            <span>{d.name}</span>
            <span className="badge">Active division</span>
          </div>
        ))}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setCreating(true);
            setDivisionError("");
            try {
              await mutate("/api/divisions", token, { name: divisionName });
              setDivisionName("");
              divisions.reload();
            } catch (c) {
              setDivisionError(
                c instanceof Error ? c.message : "Could not create division",
              );
            } finally {
              setCreating(false);
            }
          }}
        >
          <label htmlFor="division-name">New division name</label>
          <input
            id="division-name"
            value={divisionName}
            minLength={2}
            maxLength={80}
            required
            onChange={(e) => setDivisionName(e.target.value)}
          />
          <button className="primary" disabled={!token || creating}>
            {creating ? "Adding…" : "Add division"}
          </button>
          {!token && (
            <p className="muted">
              Governor access is required to add divisions.
            </p>
          )}
          {divisionError && (
            <p role="alert" className="notice error">
              {divisionError}
            </p>
          )}
        </form>
      </section>
    </>
  );
}
