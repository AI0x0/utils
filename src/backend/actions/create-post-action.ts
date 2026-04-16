import { z, ZodSchema } from "zod";
import { PgTable } from "drizzle-orm/pg-core";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { transformBody } from "./transform-body";

export function createPostAction<T extends ZodSchema, TTable extends PgTable>({
  table,
  db,
}: {
  bodySchema: T;
  db: NodePgDatabase<any>;
  table: TTable;
}) {
  return async (body: z.infer<T>): Promise<z.infer<T>[]> => {
    return db
      .insert(table)
      .values(transformBody(body as Record<string, any>))
      .returning() as any;
  };
}
