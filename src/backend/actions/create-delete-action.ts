import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { BaseTable } from "@/backend/types";
import { createGetAction } from "@/backend";
import { z } from "zod";

export function createDeleteAction<TTable extends BaseTable>({
  table,
  db,
}: {
  db: NodePgDatabase<any>;
  table: TTable;
}) {
  return async ({ id, creatorId }: { id: string; creatorId?: string }) => {
    if (creatorId) {
      const data = await createGetAction({
        db,
        table,
        bodySchema: z.object({
          creatorId: z.string(),
          id: z.string(),
        }),
      })({ creatorId, id });
      if (!data) {
        throw Error("未找到删除对象，或没有权限");
      }
    }
    return db.delete(table).where(eq(table.id, id)).returning();
  };
}
