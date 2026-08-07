import { and, eq } from "drizzle-orm";
import { BaseTable } from "@/backend/sqlite/types";
import { NO_SCOPE, ScopeArg, scopeCondition } from "@/backend/scope";
import { HttpError } from "@/backend/sqlite/errors";

export function createDeleteAction<TTable extends BaseTable>({
  table,
  db,
}: {
  db: any;
  table: TTable;
}) {
  return async (
    { id }: { id: string },
    // 与 pg 那套逐字同义，说明见 backend/actions/create-delete-action。
    { scope }: { scope: ScopeArg },
  ) => {
    if (!id) {
      throw new HttpError(400, "缺少 id");
    }
    const guard = scopeCondition(table as never, scope);
    const rows = await db
      .delete(table)
      .where(guard ? and(eq(table.id, id), guard) : eq(table.id, id))
      .returning();
    if (rows.length === 0 && scope !== NO_SCOPE) {
      throw new HttpError(404, "未找到删除对象，或没有权限");
    }
    return rows;
  };
}
