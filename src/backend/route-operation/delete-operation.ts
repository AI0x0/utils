import { routeOperation, TypedNextResponse } from "next-rest-framework";
import { z } from "zod";
import { BaseTable } from "@/backend/types";
import getTableName from "@/backend/route-operation/get-table-name";
import { createDeleteAction } from "@/backend/actions";
import { NodePgDatabase } from "drizzle-orm/node-postgres";

export interface DeleteOperationOptions<TTable extends BaseTable> {
  table: TTable;
  summary?: string;
  onSuccess?: () => Promise<void>;
}
export const createDeleteOperation =
  ({ db }: { db: NodePgDatabase<any> }) =>
  <TTable extends BaseTable>({
    table,
    summary,
    onSuccess,
  }: DeleteOperationOptions<TTable>) =>
    routeOperation({
      method: "DELETE",
      openApiOperation: {
        summary,
        tags: [getTableName(table)],
      },
    })
      .input({
        body: z.object({
          id: z.string(),
        }),
        contentType: "application/json",
      })
      .handler(async (req) => {
        const { id } = await req.json();
        const data = await createDeleteAction({ table, db })(id);
        await onSuccess?.();
        return TypedNextResponse.json(data, {
          status: 200,
        });
      }) as any;
