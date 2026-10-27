export interface Env {
  MAX_MARKETPLACE?: Fetcher;
  UNIVERSE_VIEWER_TOKEN?: string;
  UNIVERSE_AUTOMATION_TOKEN?: string;
  ICVS_EXECUTOR?: Fetcher;
  ICVS_EXECUTION_SLOTS?: string;
  FACTORY_ACTOR?: DurableObjectNamespace;
  DB: D1Database;
  MICROKERNEL_ACTOR?: DurableObjectNamespace;
  ALLOWED_ORIGINS?: string;
  GOVERNOR_API_TOKEN?: string;
  ENV?: string;
  ENVIRONMENT?: string;
}
