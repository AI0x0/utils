// 改一行。实现与 pg 那套共用，见 backend/actions/write-action-core（三条安全性质写在那儿）。

import { BaseTable } from "@/backend/sqlite/types";
import { ScopeArg } from "@/backend/scope";
import { createPutActionCore } from "@/backend/actions/write-action-core";

export function createPutAction<TTable extends BaseTable>({
  db,
  table,
}: {
  // 与改动前一致：sqlite 侧从来没有收紧过这两栏的类型。
  bodySchema: any;
  db: any;
  table: TTable;
}) {
  const run = createPutActionCore({ db, table });
  // 返回 any 而不是核心那个 unknown —— 这一栏改动前就是 any，收紧它对下游是破坏性的，
  // 而这次改动的意图是「实现合并」，不是「顺手改公开类型」。
  return async (
    body: Record<string, unknown>,
    options: { scope: ScopeArg },
  ): Promise<any> => run(body, options);
}
