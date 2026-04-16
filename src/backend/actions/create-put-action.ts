import { z, ZodSchema } from "zod";
import { transformBody } from "./transform-body";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { BaseTable } from "@/backend/types";
import { createGetAction } from "@/backend";

export function createPutAction<T extends ZodSchema, TTable extends BaseTable>({
  db,
  table,
}: {
  bodySchema: T;
  db: NodePgDatabase<any>;
  table: TTable;
}) {
  return async (
    body: Partial<z.infer<T>> & Record<string, any>,
    {
      byCreator = true,
    }: {
      byCreator?: boolean;
    } = {},
  ): Promise<z.infer<T>> => {
    if (byCreator) {
      const data = await createGetAction({
        db,
        table,
        bodySchema: z.object({
          creatorId: z.string(),
          id: z.string(),
        }),
      })({ creatorId: body.editorId, id: body.id });
      if (!data) {
        throw Error("未找到编辑对象，或没有权限");
      }
    }
    const [data] = await db
      .update(table)
      .set(transformBody(body))
      .where(eq(table.id, body.id))
      .returning();
    return data as z.infer<T>;
  };
}
