import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { BaseTable } from "@/backend/types";
import { NO_SCOPE, ScopeArg, scopeCondition } from "@/backend/scope";
import { HttpError } from "@/backend/errors";

export function createDeleteAction<TTable extends BaseTable>({
  table,
  db,
}: {
  db: NodePgDatabase<Record<string, unknown>>;
  table: TTable;
}) {
  return async (
    { id }: { id: string },
    // 作用域必填，不隔离就显式 NO_SCOPE。
    //
    // 这里原先是 `creatorId?: string` + `if (creatorId) { 校验 }` —— 也就是说传空就**不校验**，
    // 直接按 id 删。而未登录时上游传下来的正是空。类型上把它变成必填就是为了让「忘了传」
    // 成为编译错误，而不是一个能删任意行的接口。
    { scope }: { scope: ScopeArg },
  ) => {
    if (!id) {
      throw new HttpError(400, "缺少 id");
    }
    // 归属写进 DELETE 的 where，不先查后删（理由同 create-put-action）。
    const guard = scopeCondition(table, scope);
    const rows = await db
      .delete(table)
      .where(guard ? and(eq(table.id, id), guard) : eq(table.id, id))
      .returning();
    if (rows.length === 0 && scope !== NO_SCOPE) {
      // 「不存在」与「不归你」不作区分，理由同 create-put-action。
      throw new HttpError(404, "未找到删除对象，或没有权限");
    }
    return rows;
  };
}
