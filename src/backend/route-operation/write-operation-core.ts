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
  ActionFactory,
  getDefaultTags,
  handleOperationError,
  readPostBody,
  RouteCatch,
  SessionGetter,
} from "./operation-common";

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
> {
  schemas: {
    body: IB;
    response?: OB;
  };
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
  return ({ db, getSession }: { db?: unknown; getSession: SessionGetter }) =>
    <IB extends ZodSchema, OB extends ZodSchema>({
      schemas,
      contentType = "application/json",
      openApiOperation,
      parseBody,
      setBody,
      table,
      handler,
      catch: catchHandler,
    }: PostOperationOptions<IB, OB, TTable>) =>
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
            const { userId } = (await getSession(req)) || {};
            const body = await readPostBody(req, { contentType, parseBody });
            const extraBody = (await setBody?.(req)) || {};
            const params = { creatorId: userId, ...body, ...extraBody };
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
> {
  schemas: {
    body: IB;
    response?: OB;
  };
  access?: {
    byCreator?: boolean;
  };
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
      _options?: { byCreator?: boolean },
    ) => Promise<unknown>
  >;
  getTableName(table: TTable): string;
}) {
  return ({ db, getSession }: { db?: unknown; getSession: SessionGetter }) =>
    <IB extends ZodSchema, OB extends ZodSchema>({
      schemas,
      access,
      openApiOperation,
      table,
      setBody,
      handler,
      catch: catchHandler,
    }: PutOperationOptions<IB, OB, TTable>) =>
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
            const { userId } = (await getSession(req)) || {};
            const body = (await req.json()) as Record<string, unknown>;
            const extraBody =
              (await setBody?.(
                req as unknown as TypedNextRequest<
                  "PUT",
                  "application/json",
                  z.infer<IB>
                >,
              )) || {};
            const params = { editorId: userId, ...body, ...extraBody };
            const raw =
              table && db
                ? await createAction({
                    bodySchema: schemas.body,
                    db,
                    table,
                  })(params, { byCreator: access?.byCreator ?? true })
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

export interface DeleteOperationOptions<TTable, B extends ZodSchema> {
  table?: TTable;
  schemas?: {
    body?: B;
  };
  access?: {
    byCreator?: boolean;
  };
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
    (_params: { id: string; creatorId?: string }) => Promise<unknown>
  >;
  getTableName(table: TTable): string;
}) {
  return ({ db, getSession }: { db?: unknown; getSession: SessionGetter }) =>
    <B extends ZodSchema = typeof defaultDeleteBodySchema>({
      table,
      schemas,
      access,
      openApiOperation,
      handler,
      catch: catchHandler,
    }: DeleteOperationOptions<TTable, B>) =>
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
            if (access?.byCreator ?? true) {
              const { userId } = (await getSession(req)) || {};
              body.creatorId = userId;
            }
            const data =
              table && db
                ? await createAction({ db, table })({
                    creatorId: body.creatorId,
                    id: body.id,
                  })
                : body;
            await handler?.({ data, params: body, req });
            return TypedNextResponse.json(data, { status: 200 });
          } catch (error) {
            return handleOperationError(error, catchHandler);
          }
        });
}
