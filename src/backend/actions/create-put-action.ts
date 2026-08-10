// 改一行。实现（含三条安全性质）在 write-action-core，与 sqlite 共用；这里只把签名收紧到
// pg 的类型上 —— 核心为了同时喂两套方言，db 与返回值那两栏是宽的，调用方不该跟着变宽。

import { z, ZodSchema } from "zod";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { BaseTable } from "@/backend/types";
import { ScopeArg } from "@/backend/scope";
import { createPutActionCore } from "./write-action-core";

export function createPutAction<T extends ZodSchema, TTable extends BaseTable>({
  db,
  table,
}: {
  bodySchema: T;
  db: NodePgDatabase<Record<string, unknown>>;
  table: TTable;
}) {
  const run = createPutActionCore({ db, table });
  return async (
    body: Partial<z.infer<T>> & Record<string, unknown>,
    // 作用域必填，不隔离就显式 NO_SCOPE。理由见 backend/scope.ts 第 2 条。
    options: { scope: ScopeArg },
  ): Promise<z.infer<T>> => (await run(body, options)) as z.infer<T>;
}
