import { z, ZodSchema } from "zod";
import { transformBody } from "./transform-body";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { BaseTable } from "@/backend/types";
import { NO_SCOPE, ScopeArg, scopeCondition } from "@/backend/scope";
import { HttpError } from "@/backend/errors";

export function createPutAction<T extends ZodSchema, TTable extends BaseTable>({
  db,
  table,
}: {
  bodySchema: T;
  db: NodePgDatabase<Record<string, unknown>>;
  table: TTable;
}) {
  return async (
    body: Partial<z.infer<T>> & Record<string, unknown>,
    // 作用域必填，不隔离就显式 NO_SCOPE。理由见 backend/scope.ts 第 2 条。
    { scope }: { scope: ScopeArg },
  ): Promise<z.infer<T>> => {
    const id = body.id as string;
    if (!id) {
      throw new HttpError(400, "缺少 id");
    }
    // 归属条件直接写进 UPDATE 的 where，而不是「先查一次确认归属、再无条件更新」。
    // 先查后改有两个问题：多一次往返，以及那一查一改之间归属可能已经变了（转移给团队、
    // 踢出成员）。一条语句里带上归属，改不到就是改不到。
    const guard = scopeCondition(table, scope);
    const [data] = await db
      .update(table)
      .set(transformBody(body))
      .where(guard ? and(eq(table.id, id), guard) : eq(table.id, id))
      .returning();
    if (!data && scope !== NO_SCOPE) {
      // 分不清「这行不存在」与「这行不归你」是**刻意的**：分得清就等于给了一个探测接口，
      // 拿 id 挨个试就能问出「这条记录存在吗」。
      throw new HttpError(404, "未找到编辑对象，或没有权限");
    }
    return data as z.infer<T>;
  };
}
