import { transformBody } from "./transform-body";
import { and, eq } from "drizzle-orm";
import { BaseTable } from "@/backend/sqlite/types";
import { NO_SCOPE, ScopeArg, scopeCondition } from "@/backend/scope";
import { HttpError } from "@/backend/sqlite/errors";

export function createPutAction<TTable extends BaseTable>({
  db,
  table,
}: {
  bodySchema: any;
  db: any;
  table: TTable;
}) {
  return async (
    body: Record<string, unknown>,
    // 与 pg 那套逐字同义，说明见 backend/actions/create-put-action。
    { scope }: { scope: ScopeArg },
  ): Promise<any> => {
    const id = body.id as string;
    if (!id) {
      throw new HttpError(400, "缺少 id");
    }
    const guard = scopeCondition(table as never, scope);
    const [data] = await db
      .update(table)
      .set(transformBody(body))
      .where(guard ? and(eq(table.id, id), guard) : eq(table.id, id))
      .returning();
    if (!data && scope !== NO_SCOPE) {
      throw new HttpError(404, "未找到编辑对象，或没有权限");
    }
    return data;
  };
}
