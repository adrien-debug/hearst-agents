export type {
  IntegrationAdapter,
  IntegrationCredentials,
  AdapterAction,
  AdapterResult,
  IntegrationAuthType,
} from "./adapter";

export { HttpAdapter } from "./http-adapter";
export { NotionAdapter } from "./notion-adapter";

export {
  executeIntegration,
  checkConnectionHealth,
  getAdapter,
  listAdapters,
} from "./executor";
export type { IntegrationExecOptions, IntegrationExecResult } from "./executor";
