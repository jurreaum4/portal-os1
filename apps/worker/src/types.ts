export interface Env {
  FACTORY_ACTOR?: DurableObjectNamespace;
  DB: D1Database;
  MICROKERNEL_ACTOR?: DurableObjectNamespace;
  ALLOWED_ORIGINS?: string;
  GOVERNOR_API_TOKEN?: string;
  ENV?: string;
  ENVIRONMENT?: string;
}
