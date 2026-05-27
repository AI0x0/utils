import { z } from "zod";
import { transformBody } from "./transform-body";
import { eq } from "drizzle-orm";
import { BaseTable } from "@/backend/sqlite/types";
import { createGetAction } from "@/backend/sqlite";
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
    {
      byCreator = true,
    }: {
      byCreator?: boolean;
    } = {},
  ): Promise<any> => {
    if (byCreator) {
      const data = await createGetAction({
        db,
        table,
        bodySchema: z.object({
          creatorId: z.string(),
          id: z.string(),
        }),
      })({
        creatorId: body.editorId as string | undefined,
        id: body.id as string,
      });
      if (!data) {
        throw new HttpError(404, "未找到编辑对象，或没有权限");
      }
    }
    const [data] = await db
      .update(table)
      .set(transformBody(body))
      .where(eq(table.id, body.id as string))
      .returning();
    return data;
  };
}
