export interface Env {
  ICVS_EXECUTOR?: Fetcher;
  ICVS_PUBLISHER?: Fetcher;
  ICVS_COMPENSATOR?: Fetcher;
  CUSTOMER_IDENTITY?: Fetcher;
  PAYMENTS?: Fetcher;
  DOWNLOADS?: Fetcher;
  MARKETPLACE_ORIGIN?: string;
  STAFF_CREDENTIALS?: string;
  AUTOMATION_CREDENTIALS?: string;
  DEPARTMENT_CAPACITY?: string;
  ICVS_EXECUTION_SLOTS?: string;
  FACTORY_ACTOR?: DurableObjectNamespace;
  DB: D1Database;
  MICROKERNEL_ACTOR?: DurableObjectNamespace;
  ALLOWED_ORIGINS?: string;
  GOVERNOR_API_TOKEN?: string;
  ENV?: string;
  ENVIRONMENT?: string;
}
