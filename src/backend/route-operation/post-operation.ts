import { z, ZodSchema } from "zod";
import { PgTable } from "drizzle-orm/pg-core";
import { NextRequest } from "next/server";
import { routeOperation, TypedNextResponse } from "next-rest-framework";
import getTableName from "./get-table-name";
import { postActionFn } from "../actions";
import { NodePgDatabase } from "drizzle-orm/node-postgres";

export interface PostOperationOptions<
  T extends ZodSchema,
  TTable extends PgTable,
> {
  bodySchema: T;
  setBody?: (req: NextRequest) => Promise<Partial<z.infer<T>>>;
  summary?: string;
  table: TTable;
}

export const createPostOperation =
  <T extends ZodSchema, TTable extends PgTable>({
    db,
  }: {
    db: NodePgDatabase<any>;
  }) =>
  ({ bodySchema, setBody, summary, table }: PostOperationOptions<T, TTable>) =>
    routeOperation({
      method: "POST",
      openApiOperation: {
        summary,
        tags: [getTableName(table)],
      },
    })
      .input({
        body: bodySchema,
        contentType: "application/json",
      })
      .outputs([
        {
          body: z.object({ id: z.string() }),
          contentType: "application/json",
          status: 200,
        },
      ])
      .handler(async (req) => {
        const body = Object.assign(
          (await setBody?.(req)) || {},
          await req.json(),
        );
        const [data] = await postActionFn({ bodySchema, db, table })(body);
        return TypedNextResponse.json(data, { status: 200 });
      }) as any;
