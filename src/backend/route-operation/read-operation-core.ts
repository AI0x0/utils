import { NextRequest } from "next/server";
import {
  routeOperation,
  TypedNextRequest,
  TypedNextResponse,
} from "next-rest-framework";
import { z, ZodSchema } from "zod";
import { listBodySchema } from "@/backend/schemas";
import {
  createOpenApiOperation,
  type RouteOpenApiOperation,
} from "./open-api-operation";
import {
  AccessOptions,
  ActionFactory,
  callerIdOf,
  DefaultSession,
  getDefaultTags,
  getReadParams,
  GetOperationParams,
  handleOperationError,
  RouteCatch,
  SessionGetter,
} from "./operation-common";
import { ScopeArg } from "@/backend/scope";
import { withResponseHeaders } from "@/backend/response-headers";

// ==============================================================================
// GET single operation
// ==============================================================================

export interface GetOperationOptions<
  T extends ZodSchema,
  Q extends ZodSchema,
  TTable,
  TRelations,
  TSession = DefaultSession,
> {
  schemas: {
    query: Q;
    response: T;
  };
  access?: AccessOptions<TSession>;
  jsonArrayFields?: string[];
  relations?: TRelations;
  setParams?: (
    _req: TypedNextRequest<"GET", "application/json", unknown, z.infer<Q>>,
  ) => Promise<Record<string, unknown>>;
  handler?: (_payload: {
    params: GetOperationParams<Q>;
    data: z.infer<T>;
    req: NextRequest;
  }) => Promise<z.infer<T>>;
  catch?: RouteCatch;
  openApiOperation?: RouteOpenApiOperation;
  table?: TTable;
}

export function createGetOperationFactory<TTable, TRelations>({
  createAction,
  getTableName,
}: {
  createAction: ActionFactory<
    TTable,
    (
      _params: Record<string, unknown>,
      _options: { scope: ScopeArg },
    ) => Promise<unknown | undefined>
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
    <T extends ZodSchema, Q extends ZodSchema>({
      schemas,
      access,
      table,
      openApiOperation,
      relations,
      setParams,
      jsonArrayFields,
      handler,
      catch: catchHandler,
    }: GetOperationOptions<T, Q, TTable, TRelations, TSession>) =>
      routeOperation({
        method: "GET",
        openApiOperation: createOpenApiOperation({
          defaultTags: getDefaultTags({ getTableName, table }),
          openApiOperation,
        }),
      })
        .input({
          query: schemas.query as unknown as z.ZodType<
            Record<string, string | string[]>
          >,
        })
        .outputs([
          {
            body: schemas.response,
            contentType: "application/json",
            status: 200,
          },
        ])
        .handler(async (req) => {
          try {
            const {
              params: mergedParams,
              scope,
              session,
            } = await getReadParams({
              access,
              getSession,
              req,
              schemas,
              setParams,
            });
            const rawResult =
              table && db
                ? await createAction({
                    bodySchema: schemas.response,
                    db,
                    jsonArrayFields,
                    relations,
                    table,
                  })(mergedParams, { scope })
                : mergedParams;
            let result = (rawResult ?? ({} as z.infer<T>)) as z.infer<T>;
            if (handler) {
              result = await handler({
                data: result,
                // callerId 只给 handler，不进上面那份筛选/写入用的 params（见 getReadParams）。
                params: { ...mergedParams, callerId: callerIdOf(session) },
                req,
              });
            }
            return withResponseHeaders(
              TypedNextResponse.json(result, { status: 200 }),
              session,
            ) as any;
          } catch (error) {
            return handleOperationError(error, catchHandler);
          }
        });
}

// ==============================================================================
// GET list operation
// ==============================================================================

export interface GetListOperationOptions<
  T extends ZodSchema,
  Q extends ZodSchema,
  TTable,
  TRelations,
  TSession = DefaultSession,
> extends Omit<
  GetOperationOptions<T, Q, TTable, TRelations, TSession>,
  "handler"
> {
  handler?: <D extends T>(_payload: {
    params: GetOperationParams<Q>;
    data: {
      data: z.infer<D>[];
      total: number;
    };
    req: NextRequest;
  }) => Promise<{
    data: z.infer<T>[];
    total: number;
  }>;
}

export function createGetListOperationFactory<TTable, TRelations>({
  createAction,
  getTableName,
}: {
  createAction: ActionFactory<
    TTable,
    (
      _params: Record<string, unknown>,
      _options: { scope: ScopeArg },
    ) => Promise<{
      data: unknown[];
      total: number;
    }>
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
    <T extends ZodSchema, Q extends ZodSchema>({
      schemas,
      access,
      table,
      openApiOperation,
      relations,
      jsonArrayFields,
      setParams,
      handler,
      catch: catchHandler,
    }: GetListOperationOptions<T, Q, TTable, TRelations, TSession>) =>
      routeOperation({
        method: "GET",
        openApiOperation: createOpenApiOperation({
          defaultTags: getDefaultTags({ getTableName, table }),
          openApiOperation,
        }),
      })
        .input({
          query: schemas.query as unknown as z.ZodType<
            Record<string, string | string[]>
          >,
        })
        .outputs([
          {
            body: listBodySchema(schemas.response),
            contentType: "application/json",
            status: 200,
          },
        ])
        .handler(async (req) => {
          try {
            const {
              params: mergedParams,
              scope,
              session,
            } = await getReadParams({
              access,
              getSession,
              req,
              schemas,
              setParams,
            });
            let result =
              table && db
                ? await createAction({
                    bodySchema: schemas.response,
                    db,
                    jsonArrayFields,
                    relations,
                    table,
                  })(mergedParams, { scope })
                : { data: [], total: 0 };
            if (handler) {
              result = await handler({
                data: result as any,
                // callerId 只给 handler，不进上面那份筛选/写入用的 params（见 getReadParams）。
                params: { ...mergedParams, callerId: callerIdOf(session) },
                req,
              });
            }
            return withResponseHeaders(
              TypedNextResponse.json(result as any, { status: 200 }),
              session,
            ) as any;
          } catch (error) {
            return handleOperationError(error, catchHandler);
          }
        });
}
