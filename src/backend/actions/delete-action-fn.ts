import { rpcOperation } from "next-rest-framework";
import { z } from "zod";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { BaseTable } from "@/backend/types";

export function deleteActionFn<TTable extends BaseTable>({
  table,
  db,
}: {
  db: NodePgDatabase<any>;
  table: TTable;
}) {
  return rpcOperation()
    .input({
      body: z.string(),
      contentType: "application/json",
    })
    .handler(async (id) => {
      return db.delete(table).where(eq(table.id, id)).returning();
    }) as any;
}
