import { z, ZodSchema } from "zod";
import { rpcOperation } from "next-rest-framework";
import { PgTable } from "drizzle-orm/pg-core";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { transformBody } from "./transform-body";

export function postActionFn<T extends ZodSchema, TTable extends PgTable>({
  bodySchema,
  table,
  db,
}: {
  bodySchema: T;
  db: NodePgDatabase<any>;
  table: TTable;
}) {
  return rpcOperation()
    .input({
      body: bodySchema,
      contentType: "application/json",
    })
    .outputs([
      {
        body: z.array(bodySchema),
        contentType: "application/json",
        status: 200,
      },
    ])
    .handler(async (body) => {
      return db.insert(table).values(transformBody(body)).returning();
    });
}
