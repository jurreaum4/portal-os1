export interface Env {
  DB?: D1Database;
  MICROKERNEL_ACTOR?: DurableObjectNamespace;
  ALLOWED_ORIGINS?: string;
  GOVERNOR_API_TOKEN?: string;
  OBSERVATION_API_TOKEN?: string;
  ENV?: string;
  ENVIRONMENT?: string;
}
