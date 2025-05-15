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
  return async (id: string) => {
    return db.delete(table).where(eq(table.id, id)).returning();
  };
}
