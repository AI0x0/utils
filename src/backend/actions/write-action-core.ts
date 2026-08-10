// ==============================================================================
// 单行写操作的公共实现（pg / sqlite 共用）
// ==============================================================================
// 改一行、删一行，两套方言的函数体逐字相同 —— 差的只有 db 的类型（NodePgDatabase vs any）
// 和一句给 scopeCondition 的断言。而这两个函数里恰恰藏着三条**安全性质**，抄两份意味着
// 三条都要在两棵树上各维护一遍：
//
//   1. **归属写进 where，不先查后改**。先查一次确认归属、再无条件写，中间那一瞬归属可能已经
//      变了（转移给团队、被踢出成员）；一条语句里带上归属，改不到就是改不到。
//   2. **作用域必填**（不隔离要显式传 NO_SCOPE）。这里原先是可选的 creatorId + `if (有值)
//      才校验`，于是未登录传下来的空值直接变成「不校验、按 id 删任意行」。
//   3. **不区分「不存在」与「不归你」**。分得清就等于给了一个探测接口：拿 id 挨个试就能问出
//      某条记录存不存在。
//
// 这三条现在只有一份。两个方言各自的薄封装只负责把签名收紧回本方言的类型。

import { and, eq } from "drizzle-orm";
import { NO_SCOPE, ScopeArg, scopeCondition } from "@/backend/scope";
import { HttpError } from "@/backend/errors";
import { transformBody } from "./transform-body";

/** 核心用得到表的哪一部分：只有 id。dialect 各自的 Table 类型不进来。 */
export interface WriteActionTable {
  id: unknown;
}

interface WriteActionDeps<TTable extends WriteActionTable> {
  // 两套驱动的 db 类型没有公共父类型，而这里只用到 .update() / .delete()。
  // 精确类型留在两个薄封装的签名上，调用方看到的仍然是准确的。
  db: any;
  table: TTable;
}

// id 那一列在两边都是 Column，但类型不同；比较条件交给 drizzle 自己去解。
function byId<TTable extends WriteActionTable>(
  table: TTable,
  id: string,
  scope: ScopeArg,
) {
  const guard = scopeCondition(table as never, scope);
  const same = eq(table.id as never, id);
  return guard ? and(same, guard) : same;
}

export function createPutActionCore<TTable extends WriteActionTable>({
  db,
  table,
}: WriteActionDeps<TTable>) {
  return async (
    body: Record<string, unknown>,
    { scope }: { scope: ScopeArg },
  ): Promise<unknown> => {
    const id = body.id as string;
    if (!id) {
      throw new HttpError(400, "缺少 id");
    }
    const [data] = await db
      .update(table)
      .set(transformBody(body))
      .where(byId(table, id, scope))
      .returning();
    if (!data && scope !== NO_SCOPE) {
      throw new HttpError(404, "未找到编辑对象，或没有权限");
    }
    return data;
  };
}

export function createDeleteActionCore<TTable extends WriteActionTable>({
  db,
  table,
}: WriteActionDeps<TTable>) {
  return async ({ id }: { id: string }, { scope }: { scope: ScopeArg }) => {
    if (!id) {
      throw new HttpError(400, "缺少 id");
    }
    const rows = await db
      .delete(table)
      .where(byId(table, id, scope))
      .returning();
    if (rows.length === 0 && scope !== NO_SCOPE) {
      throw new HttpError(404, "未找到删除对象，或没有权限");
    }
    return rows;
  };
}
