import { z, ZodSchema } from "zod";
import { NextRequest } from "next/server";
import { routeOperation, TypedNextResponse } from "next-rest-framework";
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
  setParams?: (req: NextRequest) => Promise<Record<string, any>>;
  onSuccess?: (data: z.infer<T>) => Promise<z.infer<T>>;
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
      .handler(async (req) => {
        const params = (await setParams?.(req)) || {};
        if (byCreator) {
          const { userId } = (await getSession(req)) || {};
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
          )) || {};
        if (onSuccess) {
          result = await onSuccess(result);
        }
        return TypedNextResponse.json(result, { status: 200 });
      }) as any;
