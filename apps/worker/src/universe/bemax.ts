import type { Env } from "../types";
import type { Universe, Twin, BemaxAnswer } from "./model";
import { universe } from "./graph";
import { roleOf } from "./security";
/** Grounded navigation over the existing intelligence projection. No execution authority. */
export function answerQuestion(question: string, graph: Universe): BemaxAnswer {
  const q = question.toLowerCase();
  const result: BemaxAnswer = {
    intent: "overview",
    answer: "Here is the current MAX Universe portfolio.",
    sampledAt: graph.sampledAt,
    method:
      "Deterministic intent routing over current Universe intelligence; no language model or invented observations.",
    items: [],
    limitations: graph.integrations
      .filter((i) => ["Not connected", "No observations"].includes(i.status))
      .map((i) => `${i.id}: ${i.detail}`),
  };
  const twin = (n: Twin, detail: string) => ({
    title: n.name,
    detail,
    href: `/portal/universe?entity=${encodeURIComponent(n.id)}`,
    source: n.source,
  });
  if (/risk|alert|danger/.test(q)) {
    result.intent = "risks";
    result.items = graph.nodes
      .filter((n) => n.risk === "High")
      .map((n) => twin(n, `Risk: ${n.risk}; status: ${n.status}`));
    result.answer = result.items.length
      ? "These entities have recorded high-risk signals."
      : "No high-risk signals are recorded. Missing telemetry is not evidence of safety.";
  } else if (/division|ecosystem attention/.test(q)) {
    result.intent = "divisions";
    result.items = graph.nodes
      .filter((n) => n.kind === "division")
      .sort((a, b) => (a.health ?? 101) - (b.health ?? 101))
      .map((n) =>
        twin(
          n,
          `Health: ${n.health ?? "not observed"}; risk: ${n.risk}; revenue: ${n.revenue ?? "not observed"}`,
        ),
      );
    result.answer =
      "Divisions ordered by observed health, lowest first; unobserved health appears last.";
  } else if (/publish|releas/.test(q)) {
    result.intent = "publishing";
    result.items = graph.nodes
      .filter(
        (n) =>
          n.kind === "product" &&
          graph.workflowStages.ready?.includes(n.stage ?? ""),
      )
      .map((n) =>
        twin(
          n,
          `Ready; risk: ${n.risk}. Publishing still requires the pinned workflow approval and executor evidence.`,
        ),
      );
    result.answer = result.items.length
      ? "These products are Ready for the governed publishing workflow."
      : "No products are currently Ready for publication.";
  } else if (/opportunit|growth/.test(q)) {
    result.intent = "opportunities";
    result.items = graph.opportunities.flatMap((o) => {
      const n = graph.nodes.find((n) => n.id === o.entityId);
      return n ? [twin(n, o.reason)] : [];
    });
    result.answer = result.items.length
      ? "These opportunities come from the existing intelligence rules."
      : "No opportunities are supported by current observations.";
  } else if (/next|work on|recommend|priorit/.test(q)) {
    result.intent = "next-actions";
    result.items = graph.recommendations.map((r) => ({
      title: r.name,
      detail: `${r.priority}: ${r.reason}`,
      href: `/products/${encodeURIComponent(r.productId)}`,
      source: "Existing recommendation engine",
    }));
    result.answer = result.items.length
      ? "These are the current recommended next actions. Approve, reject or override decisions in the Governor console."
      : "There are no supported next-action recommendations yet.";
  } else if (/forecast|trend/.test(q)) {
    result.intent = "forecasts";
    result.items = graph.nodes
      .filter((n) => n.kind === "product" && n.forecast)
      .map((n) =>
        twin(
          n,
          `Revenue scenarios: ${n.forecast!.conservative} / ${n.forecast!.baseline} / ${n.forecast!.optimistic}. These are scenarios, not predictive guarantees.`,
        ),
      );
    result.answer =
      "Forecast scenarios use the existing intelligence model and observed revenue.";
  } else if (/department|capacity|backlog/.test(q)) {
    result.intent = "departments";
    result.items = graph.departments.map((d) => ({
      title: d.name,
      detail: `Workload ${d.workload}; capacity ${d.capacity ?? "unknown"}; backlog ${d.backlog}; health ${d.health}`,
      href: "/portal/universe/departments",
      source: "Department configuration and workflow projection",
    }));
    result.answer = "Here is current department capacity and workload.";
  } else {
    const matches = graph.nodes.filter((n) => q.includes(n.name.toLowerCase()));
    result.items = matches.map((n) =>
      twin(
        n,
        `Status: ${n.status}; lifecycle: ${n.stage ?? "not applicable"}; risk: ${n.risk}`,
      ),
    );
    if (matches.length) result.answer = "These entities match your question.";
    else {
      result.answer = `The portfolio contains ${graph.summary.products} products and ${graph.summary.projects} projects. Ask about opportunities, risks, next actions, publishing, divisions, departments or forecasts.`;
      result.items = [
        {
          title: "Explore the Manifold",
          detail: "Navigate the ecosystem graph and its digital twins.",
          href: "/portal/universe",
          source: "Universe graph",
        },
      ];
    }
  }
  result.items = result.items.slice(0, 50);
  return result;
}
export async function bemaxApi(
  request: Request,
  env: Env,
): Promise<Response | null> {
  if (new URL(request.url).pathname !== "/api/bemax/query") return null;
  if (request.method !== "POST")
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  if (!(await roleOf(request, env)))
    return Response.json(
      { error: "Universe access required" },
      { status: 401 },
    );
  let question: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw 0;
    let text = "";
    const decoder = new TextDecoder();
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 4096) {
        await reader.cancel();
        throw 0;
      }
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
    question = JSON.parse(text).question;
  } catch {
    return Response.json(
      { error: "A JSON question of at most 1000 characters is required" },
      { status: 400 },
    );
  }
  if (
    typeof question !== "string" ||
    !question.trim() ||
    question.length > 1000
  )
    return Response.json(
      { error: "Question must be 1–1000 characters" },
      { status: 400 },
    );
  return Response.json(answerQuestion(question, await universe(env)), {
    headers: { "Cache-Control": "no-store" },
  });
}
