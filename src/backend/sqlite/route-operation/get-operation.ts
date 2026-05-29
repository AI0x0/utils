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
import { createGetAction } from "../actions";
import { BaseTable, GetListRelations } from "@/backend/sqlite/types";

type GetOperationParams<Q extends ZodSchema> = z.infer<Q> &
  Record<string, unknown> & {
    creatorId?: string;
  };

export interface GetOperationOptions<
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
  onSuccess?: (_payload: {
    params: GetOperationParams<Q>;
    data: z.infer<T>;
  }) => Promise<z.infer<T>>;
  onError?: (
    _error: Error,
  ) => Promise<ReturnType<(typeof TypedNextResponse)["json"]> | undefined>;
  openApiOperation?: RouteOpenApiOperation;
  table?: TTable;
  byCreator?: boolean;
}

export const createGetOperation =
  ({
    getSession,
    db,
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
    setParams,
    jsonArrayFields,
    onSuccess,
    onError,
    byCreator = true,
  }: GetOperationOptions<T, Q, TTable>) =>
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
          body: bodySchema,
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
          } as GetOperationParams<Q>;
          const tableParams = mergedParams as Partial<z.infer<T>> &
            Record<string, unknown>;
          const rawResult =
            table && db
              ? await createGetAction({
                  bodySchema,
                  db,
                  jsonArrayFields,
                  relations,
                  table,
                })(tableParams)
              : mergedParams;
          let result = (rawResult ?? ({} as z.infer<T>)) as z.infer<T>;
          if (onSuccess) {
            result = await onSuccess({ data: result, params: mergedParams });
          }
          return TypedNextResponse.json(result as z.infer<T>, {
            status: 200,
          }) as any;
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
