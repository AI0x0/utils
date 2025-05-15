import { z, ZodSchema } from "zod";
import { PgTable } from "drizzle-orm/pg-core";
import { transformBody } from "./transform-body";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";

export function putActionFn<T extends ZodSchema, TTable extends PgTable>({
  db,
  table,
}: {
  bodySchema: T;
  db: NodePgDatabase<any>;
  table: TTable;
}) {
  return async (body: Partial<z.infer<T>>): Promise<T["_output"]> => {
    return (
      db
        .update(table)
        .set(transformBody(body))
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        .where(eq(table.id, body.id))
        .returning()
    );
  };
}
