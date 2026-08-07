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
            const { scope } = await resolveAccess({
              access,
              loadSession: sessionLoader(getSession, req),
              method: "POST",
            });
            const body = await readPostBody(req, { contentType, parseBody });
            const extraBody = (await setBody?.(req)) || {};
            // 新建的行归属这次请求的作用域。默认情形下作用域就是 creatorId = 当前用户，
            // 所以这与从前的行为逐字等价；换了归属列（比如 ownerId）时它自动跟着换。
            // 想再记一个「谁建的」用 setBody 补 —— 那是调用方的语义，库不猜。
            const params = { ...scopeStamp(scope), ...body, ...extraBody };
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
            const params = {
              // 「谁改的」与「能不能改」是两件事，所以这里自己取一次 —— 取值器带缓存，
              // 上面 resolveAccess 若已取过就不会再往返一次。
              editorId: ((await loadSession()) as DefaultSession | undefined)
                ?.userId,
              ...body,
              ...extraBody,
            };
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
