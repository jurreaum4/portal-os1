import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import { AsyncState } from "../components/AsyncState";
import { useGovernor } from "../layouts/GovernorLayout";
interface Catalog {
  products: {
    id: string;
    name: string;
    description: string;
    divisionId: string;
    division: string;
  }[];
  divisions: {
    id: string;
    name: string;
    parentId: string | null;
    category: string;
  }[];
  commerceConnected: boolean;
}
export default function Marketplace() {
  const load = useCallback(
    (signal: AbortSignal) =>
      api<Catalog>("/api/marketplace/catalog", { signal }),
    [],
  );
  const state = useApi(load),
    { token } = useGovernor();
  const [division, setDivision] = useState("all"),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [records, setRecords] = useState<{
    title: string;
    items: { id: string; name: string; status?: string }[];
  } | null>(null);
  async function account(kind: string) {
    setBusy(true);
    setMessage("");
    setRecords(null);
    try {
      const items = await api<{ id: string; name: string; status?: string }[]>(
        `/api/marketplace/${kind}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setRecords({ title: kind, items });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Marketplace unavailable");
    } finally {
      setBusy(false);
    }
  }
  async function action(kind: string, productId: string) {
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ url: string }>(`/api/marketplace/${kind}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const url = new URL(result.url);
      if (url.protocol !== "https:")
        throw new Error("Marketplace returned an invalid destination");
      window.location.assign(url.href);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Marketplace unavailable");
    } finally {
      setBusy(false);
    }
  }
  const allowed = new Set([division]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const d of state.data?.divisions ?? [])
      if (d.parentId && allowed.has(d.parentId) && !allowed.has(d.id)) {
        allowed.add(d.id);
        changed = true;
      }
  }
  const products =
    state.data?.products.filter(
      (p) => division === "all" || allowed.has(p.divisionId),
    ) ?? [];
  return (
    <>
      <div className="page-header">
        <div>
          <span className="eyebrow">MAX Universe</span>
          <h1>Marketplace</h1>
          <p>Published products from across the ecosystem.</p>
        </div>
        <Link to="/portal/governor">Operator console</Link>
      </div>
      <AsyncState
        loading={state.loading}
        error={state.error}
        retry={state.reload}
      />
      {state.data && (
        <>
          <section className="panel">
            <label htmlFor="market-division">Division</label>
            <select
              id="market-division"
              value={division}
              onChange={(e) => setDivision(e.target.value)}
            >
              <option value="all">All divisions</option>
              {state.data.divisions
                .filter((d) => !d.parentId)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
            <div className="bemax-prompts">
              {["library", "purchases", "creators"].map((k) => (
                <button key={k} disabled={busy} onClick={() => void account(k)}>
                  {k[0].toUpperCase() + k.slice(1)}
                </button>
              ))}
            </div>
            <p>
              Personal ICV access can be entered in{" "}
              <Link to="/settings">Settings</Link>.
            </p>
            {!state.data.commerceConnected && (
              <p className="notice">
                Commerce is not connected. Checkout, libraries and downloads
                become available when MAX Marketplace is connected.
              </p>
            )}
          </section>
          {message && <p role="alert">{message}</p>}
          {records && (
            <section className="panel">
              <h2>{records.title}</h2>
              {records.items.length ? (
                records.items.map((i) => (
                  <p key={i.id}>
                    {i.name} · {i.status ?? ""}
                  </p>
                ))
              ) : (
                <p>No records.</p>
              )}
            </section>
          )}
          <section className="u-card-grid">
            {products.map((p) => (
              <article className="panel" key={p.id}>
                <span className="badge">{p.division}</span>
                <h2>{p.name}</h2>
                <p>{p.description}</p>
                <button
                  disabled={busy || !state.data!.commerceConnected}
                  onClick={() => void action("checkout", p.id)}
                >
                  Purchase
                </button>{" "}
                <button
                  disabled={busy || !state.data!.commerceConnected}
                  onClick={() => void action("download", p.id)}
                >
                  Download owned product
                </button>
              </article>
            ))}
          </section>
          {!products.length && (
            <section className="panel">
              <h2>No published products yet</h2>
              <p>
                Products appear after the governed publishing workflow succeeds.
              </p>
            </section>
          )}
        </>
      )}
    </>
  );
}
