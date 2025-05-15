import { z, ZodSchema } from "zod";
import { transformBody } from "./transform-body";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { BaseTable } from "@/backend/types";

export function putActionFn<T extends ZodSchema, TTable extends BaseTable>({
  db,
  table,
}: {
  bodySchema: T;
  db: NodePgDatabase<any>;
  table: TTable;
}) {
  return async (body: Partial<z.infer<T>>): Promise<T["_output"]> => {
    return db
      .update(table)
      .set(transformBody(body))
      .where(eq(table.id, body.id))
      .returning();
  };
}
