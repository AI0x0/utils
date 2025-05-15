import { z, ZodSchema } from "zod";
import { NextRequest } from "next/server";
import { routeOperation, TypedNextResponse } from "next-rest-framework";
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
  setParams?: (req: NextRequest) => Promise<Record<string, unknown>>;
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
}

export const createGetListOperation =
  ({
    db,
    getSession,
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
    jsonArrayFields,
    setParams,
    onSuccess,
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
        query: querySchema,
      })
      .outputs([
        {
          body: listBodySchema(bodySchema),
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
          ),
        );

        if (onSuccess) {
          result = await onSuccess(result);
        }

        return TypedNextResponse.json(result, { status: 200 });
      }) as any;
