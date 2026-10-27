import type {
  AutomationSummary,
  SimulationResult,
} from "../../../automation-contract";
export async function automationSummary(
  db: D1Database,
): Promise<AutomationSummary> {
  const [ideas, workflows, resources, simulations, promotions, events] =
    await db.batch([
      db.prepare("SELECT state,COUNT(*) AS count FROM ideas GROUP BY state"),
      db.prepare(
        `SELECT w.*,p.name FROM automation_workflows w JOIN products p ON p.id=w.product_id ORDER BY w.updated_at DESC LIMIT 100`,
      ),
      db.prepare(`SELECT r.department,r.capacity,
   (SELECT COUNT(*) FROM automation_jobs j WHERE j.department=r.department AND j.status='leased') AS workload,
   CASE WHEN r.department='GOV' THEN (SELECT COUNT(*) FROM automation_gates g JOIN approvals a ON a.id=g.approval_id WHERE g.state='pending' AND a.status='pending') ELSE (SELECT COUNT(*) FROM automation_jobs j WHERE j.department=r.department AND j.status='queued') END AS backlog,
   (SELECT COUNT(*) FROM automation_jobs j WHERE j.department=r.department AND j.status='failed') AS failed
   FROM automation_resources r ORDER BY r.department`),
      db.prepare(
        "SELECT a.product_id,p.name,a.content,a.created_at FROM automation_artifacts a JOIN automation_workflows w ON w.product_id=a.product_id AND w.generation=a.generation JOIN products p ON p.id=a.product_id WHERE a.kind='simulation' ORDER BY a.created_at DESC LIMIT 100",
      ),
      db.prepare(
        "SELECT m.*,p.name,json_extract(m.inputs,'$.nextAction') AS nextAction,json_extract(m.inputs,'$.opportunity') AS opportunity,json_extract(m.inputs,'$.risk') AS risk FROM automation_promotions m JOIN products p ON p.id=m.product_id ORDER BY m.updated_at DESC LIMIT 100",
      ),
      db.prepare("SELECT * FROM automation_events ORDER BY id DESC LIMIT 100"),
    ]);
  return {
    policyVersion: "icvs-v1",
    ideas: ideas.results as AutomationSummary["ideas"],
    workflows: workflows.results as AutomationSummary["workflows"],
    resources: resources.results as AutomationSummary["resources"],
    simulations: (
      simulations.results as {
        product_id: string;
        name: string;
        content: string;
        created_at: string;
      }[]
    ).map((row) => ({
      ...row,
      content: JSON.parse(row.content) as SimulationResult,
    })),
    promotions: promotions.results as AutomationSummary["promotions"],
    events: events.results as AutomationSummary["events"],
  };
}
