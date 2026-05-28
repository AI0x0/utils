import { z, ZodSchema } from "zod";
import { NextRequest } from "next/server";
import {
  routeOperation,
  TypedNextRequest,
  TypedNextResponse,
} from "next-rest-framework";
import getTableName from "./get-table-name";
import { listBodySchema } from "@/backend/sqlite/schemas";
import { createGetListAction } from "@/backend/sqlite/actions";
import { BaseTable, GetListRelations } from "@/backend/sqlite/types";

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
  summary?: string;
  tags?: string[];
  table?: TTable;
  onSuccess?: <D extends T>(_payload: {
    params: Partial<z.infer<T>> & Record<string, unknown>;
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

export const createGetListOperation: any =
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
    summary,
    tags,
    relations,
    jsonArrayFields,
    setParams,
    onSuccess,
    onError,
    byCreator = true,
  }: GetListOperationOptions<T, Q, TTable>) =>
    routeOperation({
      method: "GET",
      openApiOperation: {
        summary,
        tags: tags ?? (table ? [getTableName(table)] : []),
      },
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
          const params =
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
            params.creatorId = userId;
          }

          const mergedParams = Object.assign(
            Object.fromEntries(new URL(req.url).searchParams),
            params,
          ) as Partial<z.infer<T>> & Record<string, unknown>;
          let result =
            table && db
              ? await createGetListAction({
                  bodySchema,
                  db,
                  jsonArrayFields,
                  relations,
                  table,
                })(mergedParams)
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
