import { SQLiteTable } from "drizzle-orm/sqlite-core";
import { transformBody } from "./transform-body";

export function createPostAction<TTable extends SQLiteTable>({
  table,
  db,
}: {
  bodySchema: any;
  db: any;
  table: TTable;
}) {
  return async (body: Record<string, unknown>): Promise<any[]> => {
    const values = transformBody(body as Record<string, unknown>);
    const result = await (db.insert(table) as any).values(values).returning();
    return result as any[];
  };
}
