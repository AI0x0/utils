// 删一行。实现与 pg 那套共用，见 backend/actions/write-action-core。

import { BaseTable } from "@/backend/sqlite/types";
import { createDeleteActionCore } from "@/backend/actions/write-action-core";

export function createDeleteAction<TTable extends BaseTable>({
  table,
  db,
}: {
  db: any;
  table: TTable;
}) {
  return createDeleteActionCore({ db, table });
}
