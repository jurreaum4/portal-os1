import { createContext, useContext, useEffect, useState } from "react";
import { api, setStaffToken } from "../api/client";
type Role = "Governor" | "Admin" | "Operator" | "Read Only";
const GovernorContext = createContext({
  token: "",
  role: "Read Only" as Role,
  setToken: (_value: string) => {},
});
export function GovernorLayout({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<{
    token: string;
    id: string;
    role: Role;
  } | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function signOut() {
    setStaffToken("");
    setSession(null);
  }
  useEffect(() => {
    window.addEventListener("portal-session-expired", signOut);
    return () => window.removeEventListener("portal-session-expired", signOut);
  }, []);
  async function signIn(token: string) {
    setBusy(true);
    setError("");
    try {
      const identity = await api<{ id: string; role: Role }>("/api/session", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStaffToken(token);
      setSession({ ...identity, token });
      setDraft("");
    } catch (e) {
      signOut();
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }
  if (!session)
    return (
      <main className="portal-login">
        <section className="panel">
          <div className="eyebrow">MAX ECOSYSTEM · PRIVATE WORKSPACE</div>
          <h1>Portal-OS1</h1>
          <p>
            Sign in with your staff access credential to open the command
            centre.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void signIn(draft.trim());
            }}
          >
            <label htmlFor="staff-credential">Access credential</label>
            <input
              id="staff-credential"
              type="password"
              autoComplete="off"
              required
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button className="primary" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <p className="muted">
            Authorised staff only. Access expires when this tab is reloaded.
          </p>
        </section>
      </main>
    );
  return (
    <GovernorContext.Provider
      value={{
        token: session.role === "Governor" ? session.token : "",
        role: session.role,
        setToken: (token) => {
          if (token) void signIn(token);
          else signOut();
        },
      }}
    >
      {children}
    </GovernorContext.Provider>
  );
}
export const useGovernor = () => useContext(GovernorContext);
