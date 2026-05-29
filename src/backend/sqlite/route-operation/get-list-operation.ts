import { z, ZodSchema } from "zod";
import { NextRequest } from "next/server";
import {
  routeOperation,
  TypedNextRequest,
  TypedNextResponse,
} from "next-rest-framework";
import getTableName from "./get-table-name";
import {
  createOpenApiOperation,
  type RouteOpenApiOperation,
} from "@/backend/route-operation/open-api-operation";
import { listBodySchema } from "@/backend/sqlite/schemas";
import { createGetListAction } from "@/backend/sqlite/actions";
import { BaseTable, GetListRelations } from "@/backend/sqlite/types";

type GetListOperationParams<Q extends ZodSchema> = z.infer<Q> &
  Record<string, unknown> & {
    creatorId?: string;
  };

export interface GetListOperationOptions<
  T extends ZodSchema,
  Q extends ZodSchema,
  TTable extends BaseTable,
> {
  bodySchema: T;
  jsonArrayFields?: string[];
  querySchema: Q;
  relations?: GetListRelations;
  setParams?: (
    _req: TypedNextRequest<"GET", "application/json", unknown, z.infer<Q>>,
  ) => Promise<Record<string, unknown>>;
  byCreator?: boolean;
  openApiOperation?: RouteOpenApiOperation;
  table?: TTable;
  onSuccess?: <D extends T>(_payload: {
    params: GetListOperationParams<Q>;
    data: {
      data: z.infer<D>[];
      total: number;
    };
  }) => Promise<{
    data: z.infer<T>[];
    total: number;
  }>;
  onError?: (
    _error: Error,
  ) => Promise<ReturnType<(typeof TypedNextResponse)["json"]> | undefined>;
}

export const createGetListOperation =
  ({
    db,
    getSession,
  }: {
    db?: any;
    getSession: (_req: NextRequest) => Promise<{ userId?: string } | undefined>;
  }) =>
  <T extends ZodSchema, Q extends ZodSchema, TTable extends BaseTable>({
    querySchema,
    bodySchema,
    table,
    openApiOperation,
    relations,
    jsonArrayFields,
    setParams,
    onSuccess,
    onError,
    byCreator = true,
  }: GetListOperationOptions<T, Q, TTable>) =>
    routeOperation({
      method: "GET",
      openApiOperation: createOpenApiOperation({
        defaultTags: table ? [getTableName(table)] : [],
        openApiOperation,
      }),
    })
      .input({
        query: querySchema as unknown as z.ZodType<
          Record<string, string | string[]>
        >,
      })
      .outputs([
        {
          body: listBodySchema(bodySchema),
          contentType: "application/json",
          status: 200,
        },
      ])
      .handler(async (req) => {
        try {
          const extraParams: Record<string, unknown> =
            (await setParams?.(
              req as unknown as TypedNextRequest<
                "GET",
                "application/json",
                unknown,
                z.infer<Q>
              >,
            )) || {};
          if (byCreator) {
            const { userId } = (await getSession(req)) || {};
            extraParams.creatorId = userId;
          }

          const queryParams = querySchema.parse(
            Object.fromEntries(new URL(req.url).searchParams),
          ) as z.infer<Q> & Record<string, unknown>;
          const mergedParams = {
            ...queryParams,
            ...extraParams,
          } as GetListOperationParams<Q>;
          const tableParams = mergedParams as Partial<z.infer<T>> &
            Record<string, unknown>;
          let result =
            table && db
              ? await createGetListAction({
                  bodySchema,
                  db,
                  jsonArrayFields,
                  relations,
                  table,
                })(tableParams)
              : { data: [], total: 0 };

          if (onSuccess) {
            result = (await onSuccess({
              data: result as never,
              params: mergedParams,
            })) as typeof result;
          }

          return TypedNextResponse.json(
            result as { data: z.infer<T>[]; total: number },
            { status: 200 },
          ) as any;
        } catch (e) {
          console.error(e);
          const response = await onError?.(e as Error);
          if (response) {
            return response;
          } else {
            throw e;
          }
        }
      });
