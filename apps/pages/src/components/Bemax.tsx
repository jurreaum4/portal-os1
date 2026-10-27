import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useGovernor } from "../layouts/GovernorLayout";
import type { BemaxAnswer } from "../../../worker/src/universe/model";
const prompts = [
  "Show me opportunities.",
  "Show me risks.",
  "What should I work on next?",
  "What should be published?",
  "Which division requires attention?",
];
export function Bemax() {
  const { token } = useGovernor();
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<
    { id: string; question: string; response: BemaxAnswer }[]
  >([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    setMessages([]);
    setError("");
    setBusy(false);
    return () => controller.current?.abort();
  }, [token]);
  async function ask(value: string) {
    if (busy || !value.trim()) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError("");
    try {
      const response = await api<BemaxAnswer>("/api/bemax/query", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question: value }),
        signal: abort.signal,
      });
      const message = { id: crypto.randomUUID(), question: value, response };
      setMessages((m) => [...m.slice(-9), message]);
      setQuestion("");
    } catch (e) {
      if (!abort.signal.aborted)
        setError(e instanceof Error ? e.message : "BEMAX unavailable");
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="panel bemax" aria-labelledby="bemax-title">
      <div className="section-head">
        <div>
          <span className="eyebrow">BEMAX · Intelligence layer</span>
          <h2 id="bemax-title">Ask your Universe</h2>
        </div>
        <span className="badge">Grounded in connected data</span>
      </div>
      <p>
        Explore opportunities, risks and next actions. Decisions remain in your
        approval queue.
      </p>
      <div className="bemax-prompts">
        {prompts.map((p) => (
          <button key={p} disabled={busy} onClick={() => void ask(p)}>
            {p}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <label htmlFor="bemax-question">Ask BEMAX</label>
        <div className="bemax-input">
          <input
            id="bemax-question"
            value={question}
            maxLength={1000}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What should I work on next?"
            required
          />
          <button disabled={busy || !question.trim()}>
            {busy ? "Reading Universe…" : "Ask"}
          </button>
        </div>
      </form>
      {error && <p role="alert">{error}</p>}
      <div aria-live="polite" aria-busy={busy}>
        {messages.map((m) => (
          <article className="bemax-answer" key={m.id}>
            <h3>{m.question}</h3>
            <p>{m.response.answer}</p>
            {m.response.items.map((item, j) => (
              <div key={j}>
                <Link to={item.href}>{item.title}</Link>
                <p>{item.detail}</p>
                <small>Source: {item.source}</small>
              </div>
            ))}
            <details>
              <summary>
                Evidence and coverage ·{" "}
                {new Date(m.response.sampledAt).toLocaleString()}
              </summary>
              <p>{m.response.method}</p>
              {m.response.limitations.map((l, j) => (
                <p key={j}>{l}</p>
              ))}
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}
