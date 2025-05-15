import { z, ZodSchema } from "zod";
import { PgTable } from "drizzle-orm/pg-core";
import { routeOperation, TypedNextResponse } from "next-rest-framework";
import getTableName from "@/backend/route-operation/get-table-name";
import { putActionFn } from "@/backend/actions";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { NextRequest } from "next/server";
import { BaseTable } from "@/backend/types";

export interface PutOperationOptions<
  T extends ZodSchema,
  TTable extends PgTable,
> {
  bodySchema: T;
  table: TTable;
  summary?: string;
  setBody?: (req: NextRequest) => Promise<Partial<z.infer<T>>>;
}

export const createPutOperation =
  <T extends ZodSchema, TTable extends BaseTable>({
    getSession,
    db,
  }: {
    getSession: (req: NextRequest) => Promise<{ userId?: string } | undefined>;
    db: NodePgDatabase<any>;
  }) =>
  ({ bodySchema, table, summary, setBody }: PutOperationOptions<T, TTable>) =>
    routeOperation({
      method: "PUT",
      openApiOperation: {
        summary,
        tags: [getTableName(table)],
      },
    })
      .input({
        body: bodySchema,
        contentType: "application/json",
      })
      .handler(async (req) => {
        const { userId } = (await getSession(req)) || {};
        const body = Object.assign(
          (await setBody?.(req)) || {},
          await req.json(),
        );
        return TypedNextResponse.json(
          await putActionFn({
            bodySchema,
            table,
            db,
          })({
            ...body,
            editorId: userId,
          }),
          { status: 200 },
        );
      }) as any;
