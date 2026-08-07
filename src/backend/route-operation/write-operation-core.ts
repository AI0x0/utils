import { NextRequest } from "next/server";
import {
  routeOperation,
  TypedNextRequest,
  TypedNextResponse,
} from "next-rest-framework";
import { z, ZodSchema } from "zod";
import {
  createOpenApiOperation,
  type RouteOpenApiOperation,
} from "./open-api-operation";
import {
  AccessOptions,
  ActionFactory,
  DefaultSession,
  getDefaultTags,
  handleOperationError,
  readPostBody,
  resolveAccess,
  RouteCatch,
  SessionGetter,
  sessionLoader,
} from "./operation-common";
import { NO_SCOPE, ScopeArg } from "@/backend/scope";

// ==============================================================================
// POST create operation
// ==============================================================================

export type PostOperationParams<IB extends ZodSchema> = z.infer<IB> &
  Record<string, unknown> & {
    creatorId?: string;
  };

export interface PostOperationOptions<
  IB extends ZodSchema,
  OB extends ZodSchema,
  TTable,
  TSession = DefaultSession,
> {
  schemas: {
    body: IB;
    response?: OB;
  };
  /**
   * 新建时把归属列盖成这次请求的作用域值（默认就是 creatorId = 当前用户）。
   * can 同样生效 —— 只读角色不能新建。
   */
  access?: AccessOptions<TSession>;
  contentType?: string;
  openApiOperation?: RouteOpenApiOperation;
  parseBody?: (_req: NextRequest) => Promise<Record<string, unknown>>;
  setBody?: (_req: NextRequest) => Promise<Partial<z.infer<IB>>>;
  handler?: (_payload: {
    params: PostOperationParams<IB>;
    data: z.infer<OB>;
    req: NextRequest;
  }) => Promise<z.infer<OB>>;
  catch?: RouteCatch;
  table?: TTable;
}

export function createPostOperationFactory<TTable>({
  createAction,
  getTableName,
}: {
  createAction: ActionFactory<
    TTable,
    (_body: Record<string, unknown>) => Promise<unknown[]>
  >;
  getTableName(table: TTable): string;
}) {
  return <TSession = DefaultSession>({
      db,
      getSession,
    }: {
      db?: unknown;
      getSession: SessionGetter<TSession>;
    }) =>
    <IB extends ZodSchema, OB extends ZodSchema>({
      schemas,
      access,
      contentType = "application/json",
      openApiOperation,
      parseBody,
      setBody,
      table,
      handler,
      catch: catchHandler,
    }: PostOperationOptions<IB, OB, TTable, TSession>) =>
      routeOperation({
        method: "POST",
        openApiOperation: createOpenApiOperation({
          defaultTags: getDefaultTags({ getTableName, table }),
          openApiOperation,
        }),
      })
        .input({
          body: schemas.body,
          contentType,
        })
        .outputs([
          {
            body: schemas.response || z.object({ id: z.string() }),
            contentType: "application/json",
            status: 200,
          },
        ])
        .handler(async (req) => {
          try {
            const { scope, session } = await resolveAccess({
              access,
              loadSession: sessionLoader(getSession, req),
              method: "POST",
            });
            const body = await readPostBody(req, { contentType, parseBody });
            const extraBody = (await setBody?.(req)) || {};
            // 新建的行归属这次请求的作用域。默认情形下作用域就是 creatorId = 当前用户，
            // 换了归属列（比如 ownerId）时它自动跟着换。
            //
            // 别的服务端字段（最典型的是「谁建的」）由 access.stamp 盖：归属列一旦不是
            // creatorId，作者就没人写了，而 setBody 只能返回请求体 schema 里有的字段。
            // 归属戳排在它后面 —— 两者撞同一个键时以归属为准，那是更强的那条不变量。
            //
            // **归属戳必须最后展开**，这是一条安全不变量，别为了「让调用方能覆盖」而调顺序：
            // `.input({ body })` 只校验、**不替换**请求体（next-rest-framework 交给 handler 的
            // clone 会重新解析原始 JSON），而 createPostAction 直接 insert，中间没有第二道
            // schema 过滤。所以只要 body 排在戳后面，客户端在 JSON 里塞一个 `ownerId` /
            // `creatorId` 就能把行写到别人名下 —— 调用方把该列从 schema 里 omit 掉也拦不住。
            // 见 __tests__/route-operation-scope-stamp。
            const stamped =
              session === undefined ? {} : (access?.stamp?.(session) ?? {});
            const params = {
              ...body,
              ...extraBody,
              ...stamped,
              ...scopeStamp(scope),
            };
            const raw =
              table && db
                ? (
                    await createAction({
                      bodySchema: schemas.body,
                      db,
                      table,
                    })(params)
                  )[0]
                : params;
            const data = handler
              ? await handler({
                  data: raw as z.infer<OB>,
                  params: params as PostOperationParams<IB>,
                  req,
                })
              : (raw as z.infer<OB>);
            return TypedNextResponse.json(data, { status: 200 }) as any;
          } catch (error) {
            return handleOperationError(error, catchHandler);
          }
        });
}

// ==============================================================================
// PUT update operation
// ==============================================================================

export type PutOperationParams<IB extends ZodSchema> = z.infer<IB> &
  Record<string, unknown> & {
    editorId?: string;
  };

export interface PutOperationOptions<
  IB extends ZodSchema,
  OB extends ZodSchema,
  TTable,
  TSession = DefaultSession,
> {
  schemas: {
    body: IB;
    response?: OB;
  };
  access?: AccessOptions<TSession>;
  openApiOperation?: RouteOpenApiOperation;
  table?: TTable;
  setBody?: (
    _req: TypedNextRequest<"PUT", "application/json", z.infer<IB>>,
  ) => Promise<Partial<z.infer<IB>>>;
  handler?: (_payload: {
    params: PutOperationParams<IB>;
    data: z.infer<OB>;
    req: NextRequest;
  }) => Promise<z.infer<OB>>;
  catch?: RouteCatch;
}

export function createPutOperationFactory<TTable>({
  createAction,
  getTableName,
}: {
  createAction: ActionFactory<
    TTable,
    (
      _body: Record<string, unknown>,
      _options: { scope: ScopeArg },
    ) => Promise<unknown>
  >;
  getTableName(table: TTable): string;
}) {
  return <TSession = DefaultSession>({
      db,
      getSession,
    }: {
      db?: unknown;
      getSession: SessionGetter<TSession>;
    }) =>
    <IB extends ZodSchema, OB extends ZodSchema>({
      schemas,
      access,
      openApiOperation,
      table,
      setBody,
      handler,
      catch: catchHandler,
    }: PutOperationOptions<IB, OB, TTable, TSession>) =>
      routeOperation({
        method: "PUT",
        openApiOperation: createOpenApiOperation({
          defaultTags: getDefaultTags({ getTableName, table }),
          openApiOperation,
        }),
      })
        .input({
          body: schemas.body,
          contentType: "application/json",
        })
        .outputs([
          {
            body: schemas.response || z.void(),
            contentType: "application/json",
            status: 200,
          },
        ])
        .handler(async (req) => {
          try {
            const loadSession = sessionLoader(getSession, req);
            const { scope } = await resolveAccess({
              access,
              loadSession,
              method: "PUT",
            });
            const body = (await req.json()) as Record<string, unknown>;
            const extraBody =
              (await setBody?.(
                req as unknown as TypedNextRequest<
                  "PUT",
                  "application/json",
                  z.infer<IB>
                >,
              )) || {};
            // 「谁改的」与「能不能改」是两件事，所以这里自己取一次 —— 取值器带缓存，
            // 上面 resolveAccess 若已取过就不会再往返一次。
            const editorId = (
              (await loadSession()) as DefaultSession | undefined
            )?.userId;
            // editorId 同样**最后**展开：它是审计字段，让请求体覆盖等于让人随便写「是谁改的」。
            // 理由与 POST 那边的归属戳一样，见那里的说明。
            const params = { ...body, ...extraBody, editorId };
            const raw =
              table && db
                ? await createAction({
                    bodySchema: schemas.body,
                    db,
                    table,
                  })(params, { scope })
                : params;
            const data = handler
              ? await handler({
                  data: raw as z.infer<OB>,
                  params: params as PutOperationParams<IB>,
                  req,
                })
              : (raw as z.infer<OB>);
            return TypedNextResponse.json(data, { status: 200 }) as any;
          } catch (error) {
            return handleOperationError(error, catchHandler);
          }
        });
}

// ==============================================================================
// DELETE operation
// ==============================================================================

const defaultDeleteBodySchema = z.object({
  id: z.string(),
});

export type DeleteOperationParams<B extends ZodSchema> = z.infer<B> &
  Record<string, unknown> & {
    creatorId?: string;
    id: string;
  };

export interface DeleteOperationOptions<
  TTable,
  B extends ZodSchema,
  TSession = DefaultSession,
> {
  table?: TTable;
  schemas?: {
    body?: B;
  };
  access?: AccessOptions<TSession>;
  openApiOperation?: RouteOpenApiOperation;
  handler?: (_payload: {
    params: DeleteOperationParams<B>;
    data: unknown;
    req: NextRequest;
  }) => Promise<void>;
  catch?: RouteCatch;
}

export function createDeleteOperationFactory<TTable>({
  createAction,
  getTableName,
}: {
  createAction: ActionFactory<
    TTable,
    (_params: { id: string }, _options: { scope: ScopeArg }) => Promise<unknown>
  >;
  getTableName(table: TTable): string;
}) {
  return <TSession = DefaultSession>({
      db,
      getSession,
    }: {
      db?: unknown;
      getSession: SessionGetter<TSession>;
    }) =>
    <B extends ZodSchema = typeof defaultDeleteBodySchema>({
      table,
      schemas,
      access,
      openApiOperation,
      handler,
      catch: catchHandler,
    }: DeleteOperationOptions<TTable, B, TSession>) =>
      routeOperation({
        method: "DELETE",
        openApiOperation: createOpenApiOperation({
          defaultTags: getDefaultTags({ getTableName, table }),
          openApiOperation,
        }),
      })
        .input({
          body: schemas?.body || defaultDeleteBodySchema,
          contentType: "application/json",
        })
        .handler(async (req) => {
          try {
            const bodySchema = (schemas?.body ||
              defaultDeleteBodySchema) as unknown as B;
            const body = bodySchema.parse(
              await req.json(),
            ) as DeleteOperationParams<B>;
            const { scope } = await resolveAccess({
              access,
              loadSession: sessionLoader(getSession, req),
              method: "DELETE",
            });
            const data =
              table && db
                ? await createAction({ db, table })({ id: body.id }, { scope })
                : body;
            await handler?.({ data, params: body, req });
            return TypedNextResponse.json(data, { status: 200 });
          } catch (error) {
            return handleOperationError(error, catchHandler);
          }
        });
}

// 新建时要往行上盖的归属字段。多值作用域（IN）在新建这里没有意义 —— 一行只能属于一个归属，
// 所以那种配置直接拒绝，而不是随便挑一个。
function scopeStamp(scope: ScopeArg): Record<string, unknown> {
  if (scope === NO_SCOPE) {
    return {};
  }
  if (Array.isArray(scope.value)) {
    throw new Error(
      `新建操作的作用域不能是多值：一行只能属于一个 ${scope.column}。多值作用域只用于读。`,
    );
  }
  return { [scope.column]: scope.value };
}
