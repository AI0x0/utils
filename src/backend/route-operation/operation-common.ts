import { NextRequest } from "next/server";
import { TypedNextRequest, TypedNextResponse } from "next-rest-framework";
import { z, ZodSchema } from "zod";
import { HttpError } from "@/backend/errors";
import {
  isEmptyScopeValue,
  NO_SCOPE,
  ScopeArg,
  ScopeValue,
} from "@/backend/scope";

export type JsonResponse = ReturnType<(typeof TypedNextResponse)["json"]>;
export type RouteCatch = (error: Error) => Promise<JsonResponse | undefined>;

// ==============================================================================
// 会话与准入的类型
// ==============================================================================

/** 默认的会话形状。够用于「一条记录属于一个人」的场景。 */
export interface DefaultSession {
  userId?: string;
}

/**
 * 会话读取器。泛型化是为了让调用方能在这里一次性解析出「你是谁 + 你现在站在哪个空间 +
 * 你在那个空间里是什么角色」，后面 access.scope / access.can 都读同一份，不必各自再查一遍库。
 */
export type SessionGetter<TSession = DefaultSession> = (
  req: NextRequest,
) => Promise<TSession | undefined>;

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

/** can 返回它表示拒绝，可自定状态码与文案；返回 false 等价于 { status: 403 }。 */
export interface AccessDenial {
  status?: number;
  message?: string;
}

export interface AccessOptions<TSession = DefaultSession> {
  /**
   * 老写法，等价于 `scope: { column: "creatorId", value: (s) => s.userId }`。
   * 与 scope 同时给时以 scope 为准。
   */
  byCreator?: boolean;
  /**
   * 行级作用域：这次请求只能看到 / 只能动 `column` 等于（或属于）`value` 的那些行。
   * column 不填默认 "creatorId"。
   *
   * value 拿不到值（会话没有、或返回空）时请求会被拒绝，**不会**退化成「不筛」——
   * 那正是这套东西存在的意义，见 scope.ts 的说明。
   */
  scope?: {
    column?: string;
    value: (session: TSession) => ScopeValue | undefined;
  };
  /**
   * 准入判断。作用域管「能看到哪些行」，这里管「能不能做这个动作」——比如只读角色不能写。
   * 收在一处而不是散在各路由里：多一档角色时，散着写必然漏。
   */
  can?: (_ctx: {
    session: TSession;
    method: HttpMethod;
  }) => boolean | AccessDenial | Promise<boolean | AccessDenial>;
  /**
   * 新建（POST）时额外要盖在行上的列。归属列由 `scope` 盖，这里管别的服务端字段 ——
   * 最典型的就是「谁建的」：归属列一旦不是 `creatorId`（比如换成 `ownerId`），作者就没人写了，
   * 而 `setBody` 只能返回请求体 schema 里有的字段，`creatorId` 不在里面。
   *
   * 与归属戳同一条不变量：**最后展开，客户端覆盖不了**。所以这里能安全地盖任何服务端字段，
   * 不必担心请求体里塞一个同名键把它顶掉。
   *
   * 库不替业务猜要盖什么（哪张表有 creatorId、要不要记作者，都是业务的事），所以给的是钩子
   * 而不是默认行为。
   */
  stamp?: (session: TSession) => Record<string, unknown>;
}

const DEFAULT_SCOPE_COLUMN = "creatorId";

// ==============================================================================
// 作用域解析
// ==============================================================================

/**
 * 把会话读取包成「本次请求最多取一次」的取值器。
 *
 * 会话在一次请求里可能被好几处要：作用域要它算归属、can 要它判角色、PUT 还要它填 editorId。
 * 各自去调 getSession 就是重复往返；预先无条件取一次，则公开端点（关掉隔离的那些）要白付一次
 * 读取。包一层惰性缓存之后两个问题一起没了 —— 谁要谁调，取不取由用不用决定，不必谁去传一个
 * 「要不要取」的开关。
 */
export function sessionLoader<TSession>(
  getSession: SessionGetter<TSession>,
  req: NextRequest,
): () => Promise<TSession | undefined> {
  let pending: Promise<TSession | undefined> | undefined;
  return () => (pending ??= getSession(req));
}

/**
 * 解析这次请求的会话、作用域与准入。
 *
 * **失败一律抛，不降级。** 会话拿不到就是 401、作用域取不到值就是 403 —— 绝不把一个空值
 * 往下传。这条是本次改动的核心：在此之前空值会一路流到查询构造器，被「空值跳过筛选」那条
 * 规则吃掉，结果是列表返回全表、删除按 id 删任意行。
 */
export async function resolveAccess<TSession>({
  access,
  loadSession,
  method,
}: {
  access?: AccessOptions<TSession>;
  /** 见 sessionLoader —— 传取值器而不是 (getSession, req)，取不取由这里自己决定。 */
  loadSession: () => Promise<TSession | undefined>;
  method: HttpMethod;
}): Promise<{ scope: ScopeArg; session: TSession | undefined }> {
  const wantsScope = Boolean(access?.scope) || (access?.byCreator ?? true);
  // 不需要就不取：关掉隔离的路由（多半是公开端点）不该为此白付一次会话读取。
  // stamp 也要会话 —— 它是拿会话算「盖哪些列」的。
  const session =
    wantsScope || access?.can || access?.stamp
      ? await loadSession()
      : undefined;

  if (access?.can) {
    if (!session) {
      throw new HttpError(401, "未登录");
    }
    const verdict = await access.can({ method, session });
    if (verdict !== true) {
      const denial = typeof verdict === "object" ? verdict : {};
      throw new HttpError(denial.status ?? 403, denial.message ?? "没有权限");
    }
  }

  if (!wantsScope) {
    return { scope: NO_SCOPE, session };
  }
  if (!session) {
    throw new HttpError(401, "未登录");
  }

  const column = access?.scope?.column ?? DEFAULT_SCOPE_COLUMN;
  const value = access?.scope
    ? access.scope.value(session)
    : (session as DefaultSession).userId;

  if (isEmptyScopeValue(value)) {
    throw new HttpError(
      403,
      `无法确定这次请求的归属（${column}）。这不是「不做隔离」——请求被拒绝。`,
    );
  }
  return { scope: { column, value }, session };
}

// ==============================================================================
// 动作工厂
// ==============================================================================

export type ActionFactory<TTable, TAction> = (_options: {
  bodySchema?: ZodSchema;
  db: unknown;
  jsonArrayFields?: string[];
  relations?: unknown;
  table: TTable;
}) => TAction;

// ==============================================================================
// 错误处理
// ==============================================================================

type HttpLikeError = Error & {
  status?: number;
};

function isHttpLikeError(error: unknown): error is HttpLikeError {
  return (
    error instanceof Error &&
    error.name === "HttpError" &&
    typeof (error as HttpLikeError).status === "number"
  );
}

export async function handleOperationError(
  error: unknown,
  catchHandler?: RouteCatch,
) {
  if (!isHttpLikeError(error)) {
    console.error(error);
  }
  const response = await catchHandler?.(error as Error);
  if (response) {
    return response;
  }
  if (isHttpLikeError(error)) {
    return TypedNextResponse.json({ message: error.message } as never, {
      status: error.status,
    });
  }
  throw error;
}

// ==============================================================================
// 请求体与标签
// ==============================================================================

export async function readPostBody(
  req: NextRequest,
  {
    contentType,
    parseBody,
  }: {
    contentType: string;
    parseBody?: (_req: NextRequest) => Promise<Record<string, unknown>>;
  },
) {
  if (parseBody) {
    return parseBody(req);
  }
  if (contentType === "multipart/form-data") {
    return Object.fromEntries(await req.formData());
  }
  return (await req.json()) as Record<string, unknown>;
}

export function getDefaultTags<TTable>({
  getTableName,
  table,
}: {
  getTableName(table: TTable): string;
  table?: TTable;
}) {
  return table ? [getTableName(table)] : [];
}

// ==============================================================================
// 读操作的参数
// ==============================================================================

export type GetOperationParams<Q extends ZodSchema> = z.infer<Q> &
  Record<string, unknown> & {
    creatorId?: string;
  };

/**
 * 读操作的参数与作用域。
 *
 * 注意作用域**不进 params**：params 会被查询构造器当筛选条件处理，而那里的规矩是「空值跳过」。
 * 作用域走单独一条通道交给 action，见 scope.ts 顶部第 1 条。
 */
export async function getReadParams<Q extends ZodSchema, TSession>({
  access,
  getSession,
  req,
  schemas,
  setParams,
}: {
  access?: AccessOptions<TSession>;
  getSession: SessionGetter<TSession>;
  req: NextRequest;
  schemas: { query: Q };
  setParams?: (
    _req: TypedNextRequest<"GET", "application/json", unknown, z.infer<Q>>,
  ) => Promise<Record<string, unknown>>;
}) {
  const extraParams: Record<string, unknown> =
    (await setParams?.(
      req as unknown as TypedNextRequest<
        "GET",
        "application/json",
        unknown,
        z.infer<Q>
      >,
    )) || {};
  const { scope, session } = await resolveAccess({
    access,
    loadSession: sessionLoader(getSession, req),
    method: "GET",
  });
  const queryParams = schemas.query.parse(
    Object.fromEntries(new URL(req.url).searchParams),
  ) as z.infer<Q> & Record<string, unknown>;
  return {
    params: { ...queryParams, ...extraParams } as GetOperationParams<Q>,
    scope,
    session,
  };
}
