import { z, ZodSchema } from "zod";
import { NextRequest } from "next/server";
import {
  routeOperation,
  TypedNextRequest,
  TypedNextResponse,
} from "next-rest-framework";
import getTableName from "./get-table-name";
import { createGetAction } from "../actions";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { BaseTable, GetListRelations } from "@/backend/types";

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
    req: TypedNextRequest<"GET", "application/json", unknown, z.infer<Q>>,
  ) => Promise<Record<string, any>>;
  onSuccess?: (data: z.infer<T>) => Promise<z.infer<T>>;
  onError?: (
    error: Error,
  ) => Promise<ReturnType<(typeof TypedNextResponse)["json"]> | undefined>;
  summary?: string;
  table: TTable;
  byCreator?: boolean;
}

export const createGetOperation =
  ({
    getSession,
    db,
  }: {
    db: NodePgDatabase<any>;
    getSession: (req: NextRequest) => Promise<{ userId?: string } | undefined>;
  }) =>
  <T extends ZodSchema, Q extends ZodSchema, TTable extends BaseTable>({
    querySchema,
    bodySchema,
    table,
    summary,
    relations,
    setParams,
    jsonArrayFields,
    onSuccess,
    onError,
    byCreator = true,
  }: GetOperationOptions<T, Q, TTable>) =>
    routeOperation({
      method: "GET",
      openApiOperation: {
        summary,
        tags: [getTableName(table)],
      },
    })
      .input({
        query: querySchema,
      })
      .outputs([
        {
          body: bodySchema,
          contentType: "application/json",
          status: 200,
        },
      ])
      .handler(async (req: any) => {
        try {
          const params = (await setParams?.(req)) || ({} as any);
          if (byCreator) {
            const { userId } = (await getSession(req)) || ({} as any);
            params.creatorId = userId;
          }

          let result =
            (await createGetAction({
              bodySchema,
              db,
              jsonArrayFields,
              relations,
              table,
            })(
              Object.assign(
                Object.fromEntries(new URL(req.url).searchParams),
                params,
              ) as any,
            )) || ({} as any);
          if (onSuccess) {
            result = (await onSuccess(result as any)) as any;
          }
          return TypedNextResponse.json(result, { status: 200 });
        } catch (e) {
          const response = await onError?.(e as Error);
          if (response) {
            return response as any;
          } else {
            throw e;
          }
        }
      }) as any;
