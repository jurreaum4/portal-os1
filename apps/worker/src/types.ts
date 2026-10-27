export interface Env {
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
