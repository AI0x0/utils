// 删一行。实现（含三条安全性质：归属写进 where、作用域必填、不区分「不存在」与「不归你」）
// 在 write-action-core，与 sqlite 共用。

import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { BaseTable } from "@/backend/types";
import { createDeleteActionCore } from "./write-action-core";

export function createDeleteAction<TTable extends BaseTable>({
  table,
  db,
}: {
  db: NodePgDatabase<Record<string, unknown>>;
  table: TTable;
}) {
  return createDeleteActionCore({ db, table });
}
