export * from "./get-operation";
export * from "./get-list-operation";
export * from "./delete-operation";
export * from "./post-operation";
export * from "./put-operation";
export * from "./open-api-operation";
// 调用方要自己拼 access 预设（把 scope / can / stamp 收在一处复用）就得有这几个类型 ——
// 不导出的话只能在业务里重写一遍 HttpMethod 之类，两边一旦漂移就是静默的错配。
export type {
  AccessDenial,
  AccessOptions,
  DefaultSession,
  HttpMethod,
  SessionGetter,
} from "./operation-common";
export type { ScopeCondition, ScopeValue } from "../scope";
