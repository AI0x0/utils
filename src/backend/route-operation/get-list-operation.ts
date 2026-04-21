import { z, ZodSchema } from "zod";
import { NextRequest } from "next/server";
import {
  routeOperation,
  TypedNextRequest,
  TypedNextResponse,
} from "next-rest-framework";
import getTableName from "./get-table-name";
import { listBodySchema } from "@/backend/schemas";
import { createGetListAction } from "@/backend/actions";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { BaseTable, GetListRelations } from "@/backend/types";

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
    req: TypedNextRequest<"GET", "application/json", unknown, z.infer<Q>>,
  ) => Promise<Record<string, unknown>>;
  byCreator?: boolean;
  summary?: string;
  table: TTable;
  onSuccess?: <D extends T>(data: {
    data: z.infer<D>[];
    total: number;
  }) => Promise<{
    data: z.infer<T>[];
    total: number;
  }>;
  onError?: (
    error: Error,
  ) => Promise<ReturnType<(typeof TypedNextResponse)["json"]> | undefined>;
}

export const createGetListOperation =
  ({
    db,
    getSession,
  }: {
    db: NodePgDatabase<Record<string, unknown>>;
    getSession: (req: NextRequest) => Promise<{ userId?: string } | undefined>;
  }) =>
  <T extends ZodSchema, Q extends ZodSchema, TTable extends BaseTable>({
    querySchema,
    bodySchema,
    table,
    summary,
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
        tags: [getTableName(table)],
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

          let result = await createGetListAction({
            bodySchema,
            db,
            jsonArrayFields,
            relations,
            table,
          })(
            Object.assign(
              Object.fromEntries(new URL(req.url).searchParams),
              params,
            ) as Partial<z.infer<T>> & Record<string, unknown>,
          );

          if (onSuccess) {
            result = await onSuccess(result);
          }

          return TypedNextResponse.json(
            result as { data: z.infer<T>[]; total: number },
            { status: 200 },
          );
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
