import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useApi } from "../../pages/src/hooks/useApi";
import { request, post, price, type Item } from "./api";
import "./style.css";
const categories = [
  ["games", "Games", "Play something extraordinary", "◈"],
  ["apps", "Apps", "Make more possible", "⌘"],
  ["art", "Art", "Create without limits", "✳"],
  ["media", "Media", "Find a new perspective", "◉"],
  ["institute", "Institute", "Keep your curiosity moving", "↗"],
];
function Status({ loading, error }: { loading?: boolean; error?: string }) {
  return error ? (
    <p className="notice error" role="alert">
      {error}
    </p>
  ) : loading ? (
    <p className="notice" role="status">
      Loading…
    </p>
  ) : null;
}
function Card({ item }: { item: Item }) {
  return (
    <Link className={`product-card ${item.type}`} to={`/product/${item.slug}`}>
      <div className="product-art">
        <span>{item.title.slice(0, 1)}</span>
        <small>{item.type}</small>
      </div>
      <div className="product-copy">
        <span className="creator">{item.creatorName}</span>
        <h3>{item.title}</h3>
        <p>{item.summary}</p>
        <strong>{price(item)}</strong>
        <span className="card-arrow">↗</span>
      </div>
    </Link>
  );
}
function Catalog({ category = "products" }: { category?: string }) {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const cursor = params.get("cursor") ?? "0";
  const load = useCallback(
    (signal: AbortSignal) =>
      request<{ items: Item[]; nextCursor: number | null }>(
        `/api/${category}?q=${encodeURIComponent(query)}&cursor=${encodeURIComponent(cursor)}`,
        { signal },
      ),
    [category, query, cursor],
  );
  const state = useApi(load);
  const current = categories.find((c) => c[0] === category);
  return (
    <>
      {category === "products" ? (
        <section className="hero">
          <div className="eyebrow">THE MAX ECOSYSTEM</div>
          <h1>
            Discover your <em>next.</em>
          </h1>
          <p>
            New worlds to explore. Tools to make your own.
            <br />
            Games, apps, art, media and learning — all in one place.
          </p>
          <a className="button light" href="#catalog">
            Explore the marketplace <span>↗</span>
          </a>
          <div className="hero-orbit" aria-hidden="true">
            <div>
              MAX<span>CREATE · PLAY · DISCOVER</span>
            </div>
          </div>
        </section>
      ) : (
        <section className={`category-heading ${category}`}>
          <div className="eyebrow">EXPLORE MAX</div>
          <h1>{current?.[1]}</h1>
          <p>{current?.[2]}.</p>
        </section>
      )}
      <nav className="category-grid" aria-label="Discover categories">
        {categories.map(([slug, title, description, symbol]) => (
          <Link to={`/${slug}`} className={`category ${slug}`} key={slug}>
            <span>{symbol}</span>
            <div>
              <strong>{title}</strong>
              <small>{description}</small>
            </div>
            <b>↗</b>
          </Link>
        ))}
      </nav>
      <section id="catalog">
        <div className="section-heading">
          <div className="eyebrow">MADE FOR WHAT COMES NEXT</div>
          <h2>
            {current
              ? `Explore ${current[1].toLowerCase()}`
              : "Explore the marketplace"}
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const q = new FormData(e.currentTarget).get("q") as string;
              setParams(q ? { q } : {});
            }}
          >
            <label className="sr-only" htmlFor="search">
              Search products
            </label>
            <input
              key={query}
              id="search"
              name="q"
              type="search"
              maxLength={100}
              placeholder="Find your next favourite…"
              defaultValue={query}
            />
            <button>Search</button>
          </form>
        </div>
        <Status {...state} />
        {state.error && <button onClick={state.reload}>Try again</button>}
        {state.data && (
          <>
            {state.data.items.length ? (
              <div className="products-grid">
                {state.data.items.map((item) => (
                  <Card key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <div className="empty">
                <span>✳</span>
                <h3>
                  {query ? "No matches yet" : "Something new starts here"}
                </h3>
                <p>
                  {query
                    ? "Try another search or explore a different category."
                    : "Published releases will appear here as creators bring their work to MAX."}
                </p>
              </div>
            )}
            <div className="pagination">
              {cursor !== "0" && (
                <button onClick={() => setParams(query ? { q: query } : {})}>
                  Back to first page
                </button>
              )}
              {state.data.nextCursor !== null && (
                <button
                  onClick={() =>
                    setParams({
                      q: query,
                      cursor: String(state.data!.nextCursor),
                    })
                  }
                >
                  More products →
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </>
  );
}
function Product() {
  const { slug } = useParams();
  const load = useCallback(
    (signal: AbortSignal) =>
      request<
        Item & { reviews: { name: string; rating: number; body: string }[] }
      >(`/api/products/${encodeURIComponent(slug ?? "")}`, { signal }),
    [slug],
  );
  const state = useApi(load);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function purchase() {
    if (!state.data) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await post<{ status: string; url?: string }>(
        "/api/orders",
        { releaseId: state.data.id },
      );
      if (result.url) window.location.assign(result.url);
      else setMessage("Added to your library. Open your library to download.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Purchase failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Status {...state} />
      {state.data && (
        <>
          <section className="detail">
            <div className={`detail-art ${state.data.type}`} aria-hidden="true">
              {state.data.title.slice(0, 1)}
            </div>
            <div>
              <div className="eyebrow">{state.data.type}</div>
              <h1>{state.data.title}</h1>
              <p>
                By{" "}
                <Link to={`/creators/${state.data.creatorSlug}`}>
                  {state.data.creatorName}
                </Link>
              </p>
              <p className="description">{state.data.summary}</p>
              <h2>{price(state.data)}</h2>
              <button className="primary" disabled={busy} onClick={purchase}>
                {busy
                  ? "Preparing…"
                  : state.data.priceMinor
                    ? "Purchase"
                    : "Add to library"}
              </button>
              <p>
                <Link to="/account">Sign in</Link> to purchase or download.{" "}
                <Link to="/library">Open library →</Link>
              </p>
              {message && (
                <p className="notice" role="status">
                  {message}
                </p>
              )}
            </div>
          </section>
          <section className="panel">
            <h2>Community reviews</h2>
            {!state.data.reviews.length && <p>No reviews yet.</p>}
            {state.data.reviews.map((r, i) => (
              <article className="review" key={i}>
                <strong>
                  {r.name} · {r.rating}/5
                </strong>
                <p>{r.body}</p>
              </article>
            ))}
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setMessage("");
                const data = new FormData(e.currentTarget);
                try {
                  await post("/api/reviews", {
                    releaseId: state.data!.id,
                    rating: Number(data.get("rating")),
                    body: data.get("body"),
                  });
                  setMessage("Your review has been saved.");
                  state.reload();
                } catch (e) {
                  setMessage(e instanceof Error ? e.message : "Review failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h3>Share your experience</h3>
              <p>Reviews are available to customers who own this product.</p>
              <label>
                Rating
                <select name="rating" defaultValue="5">
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n} / 5
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Your review
                <textarea name="body" required minLength={5} maxLength={2000} />
              </label>
              <button disabled={busy}>Save review</button>
            </form>
          </section>
        </>
      )}
    </>
  );
}
const accountLoad = (signal: AbortSignal) =>
  request<{ id: string; name: string }>("/api/account", { signal });
const ordersLoad = (signal: AbortSignal) =>
  request<{ id: string; title: string; status: string }[]>("/api/orders", {
    signal,
  });
function Account() {
  const state = useApi(accountLoad);
  const [params, setParams] = useSearchParams();
  const completing = useRef(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const code = params.get("code"),
      authState = params.get("state");
    if (!code || !authState || completing.current) return;
    completing.current = true;
    setBusy(true);
    post("/api/auth/complete", { code, state: authState })
      .then(() => {
        setParams({}, { replace: true });
        state.reload();
      })
      .catch((e) => {
        setMessage(e.message);
        setParams({}, { replace: true });
      })
      .finally(() => setBusy(false));
  }, [params]);
  return (
    <section className="account panel">
      <div className="eyebrow">YOUR MAX WORLD</div>
      <h1>Account</h1>
      {busy && <p role="status">Connecting your account…</p>}
      {state.data ? (
        <>
          <h2>Hello, {state.data.name}</h2>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await post("/api/account", {
                  name: new FormData(e.currentTarget).get("name"),
                });
                state.reload();
                setMessage("Profile updated.");
              } catch (e) {
                setMessage(e instanceof Error ? e.message : "Update failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Display name
              <input
                name="name"
                defaultValue={state.data.name}
                required
                minLength={2}
                maxLength={80}
              />
            </label>
            <button disabled={busy}>Save profile</button>
          </form>
          <p>
            <Link to="/library">Your library →</Link>
          </p>
          <button
            onClick={async () => {
              try {
                await post("/api/auth/logout");
                state.reload();
              } catch (e) {
                setMessage(e instanceof Error ? e.message : "Sign-out failed");
              }
            }}
          >
            Sign out
          </button>
          <Orders initialOrder={params.get("order")} />
        </>
      ) : (
        <>
          <p>One account for your purchases, downloads and library.</p>
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setMessage("");
              try {
                const result = await post<{ url: string }>("/api/auth/start");
                window.location.assign(result.url);
              } catch (e) {
                setMessage(
                  e instanceof Error ? e.message : "Sign-in unavailable",
                );
                setBusy(false);
              }
            }}
          >
            Continue to secure sign-in →
          </button>
        </>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
function Orders({ initialOrder }: { initialOrder: string | null }) {
  const state = useApi(ordersLoad);
  const [message, setMessage] = useState("");
  async function refresh(id: string) {
    try {
      const result = await request<{ status: string }>(
        `/api/orders/${encodeURIComponent(id)}`,
      );
      setMessage(`Order status: ${result.status}`);
      state.reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not check order");
    }
  }
  useEffect(() => {
    if (initialOrder) void refresh(initialOrder);
  }, [initialOrder]);
  return (
    <>
      <h2>Your orders</h2>
      <Status {...state} />
      {state.data?.length === 0 && <p>No orders yet.</p>}
      {state.data?.map((o) => (
        <div className="list-row" key={o.id}>
          <span>
            {o.title} · {o.status}
          </span>
          <button onClick={() => refresh(o.id)}>Check payment</button>
        </div>
      ))}
      {message && <p role="status">{message}</p>}
    </>
  );
}
function Library() {
  const [hidden, setHidden] = useState(false);
  const load = useCallback(
    (signal: AbortSignal) =>
      request<Item[]>(`/api/library?hidden=${hidden}`, { signal }),
    [hidden],
  );
  const state = useApi(load);
  const [error, setError] = useState("");
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">YOURS TO EXPLORE</div>
        <h1>Your library</h1>
        <p>Your games, tools and creative possibilities.</p>
        <button onClick={() => setHidden(!hidden)}>
          {hidden ? "Show library" : "Show hidden products"}
        </button>
      </div>
      <Status {...state} />
      {state.error && <Link to="/account">Open your account →</Link>}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {state.data?.length === 0 && (
        <div className="empty">
          <h2>
            {hidden ? "No hidden products" : "Your next discovery belongs here"}
          </h2>
          <Link to="/">Explore the marketplace →</Link>
        </div>
      )}
      <div className="products-grid">
        {state.data?.map((item) => (
          <article key={item.id}>
            <Card item={item} />
            <div className="library-actions">
              <button
                className="primary"
                onClick={async () => {
                  setError("");
                  try {
                    const grant = await post<{ url: string }>(
                      "/api/downloads",
                      { releaseId: item.id },
                    );
                    window.location.assign(grant.url);
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "Download failed",
                    );
                  }
                }}
              >
                Download
              </button>
              <button
                onClick={async () => {
                  try {
                    await post(`/api/library/${encodeURIComponent(item.id)}`, {
                      hidden: !hidden,
                    });
                    state.reload();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Update failed");
                  }
                }}
              >
                {hidden ? "Restore" : "Hide"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
const downloadsLoad = (signal: AbortSignal) =>
  request<{ id: string; title: string; slug: string; createdAt: string }[]>(
    "/api/downloads",
    { signal },
  );
function Downloads() {
  const state = useApi(downloadsLoad);
  return (
    <section className="panel">
      <div className="eyebrow">READY WHEN YOU ARE</div>
      <h1>Downloads</h1>
      <p>
        Download products from <Link to="/library">your library</Link>. Your
        recent downloads appear here.
      </p>
      <Status {...state} />
      {state.error && <Link to="/account">Sign in →</Link>}
      {state.data?.length === 0 && <p>No downloads yet.</p>}
      {state.data?.map((d) => (
        <Link className="list-row" to={`/product/${d.slug}`} key={d.id}>
          <strong>{d.title}</strong>
          <span>{d.createdAt}</span>
        </Link>
      ))}
    </section>
  );
}
function Creator() {
  const { slug } = useParams();
  const load = useCallback(
    (signal: AbortSignal) =>
      request<{ name: string; bio: string; items: Item[] }>(
        `/api/creators/${encodeURIComponent(slug ?? "")}`,
        { signal },
      ),
    [slug],
  );
  const state = useApi(load);
  return (
    <>
      <Status {...state} />
      {state.data && (
        <>
          <div className="page-title">
            <div className="eyebrow">MAX CREATORS</div>
            <h1>{state.data.name}</h1>
            <p>{state.data.bio}</p>
          </div>
          <div className="products-grid">
            {state.data.items.map((item) => (
              <Card key={item.id} item={item} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
function App() {
  return (
    <BrowserRouter>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header>
        <Link className="logo" to="/">
          MAX<span>DISCOVER YOUR NEXT</span>
        </Link>
        <nav aria-label="Main navigation">
          {categories.map(([slug, title]) => (
            <NavLink key={slug} to={`/${slug}`}>
              {title}
            </NavLink>
          ))}
        </nav>
        <div className="account-nav">
          <Link to="/library">Library</Link>
          <Link to="/account" className="account-link">
            Account ↗
          </Link>
        </div>
      </header>
      <main id="main">
        <Routes>
          <Route index element={<Catalog />} />
          {categories.map(([slug]) => (
            <Route
              key={slug}
              path={slug}
              element={<Catalog category={slug} />}
            />
          ))}
          <Route path="product/:slug" element={<Product />} />
          <Route path="creators/:slug" element={<Creator />} />
          <Route path="library" element={<Library />} />
          <Route path="downloads" element={<Downloads />} />
          <Route path="account" element={<Account />} />
          <Route
            path="*"
            element={
              <section className="empty">
                <h1>Page not found</h1>
                <Link to="/">Back to MAX</Link>
              </section>
            }
          />
        </Routes>
      </main>
      <footer>
        <Link className="logo" to="/">
          MAX
        </Link>
        <p>Play. Create. Learn. Repeat.</p>
        <nav aria-label="Footer">
          <Link to="/downloads">Downloads</Link>
          <Link to="/library">Your library</Link>
          <Link to="/account">Account</Link>
        </nav>
        <small>THE MAX ECOSYSTEM</small>
      </footer>
    </BrowserRouter>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
