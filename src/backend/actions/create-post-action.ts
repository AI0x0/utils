import { z, ZodSchema } from "zod";
import { AnyDatabase } from "@/backend/types";
import { PgTable } from "drizzle-orm/pg-core";
import { transformBody } from "./transform-body";

export function createPostAction<T extends ZodSchema, TTable extends PgTable>({
  table,
  db,
}: {
  bodySchema: T;
  db: AnyDatabase;
  table: TTable;
}) {
  return async (body: z.infer<T>): Promise<z.infer<T>[]> => {
    const values = transformBody(body as Record<string, unknown>);
    const result = await (db.insert(table) as any).values(values).returning();
    return result as z.infer<T>[];
  };
}
