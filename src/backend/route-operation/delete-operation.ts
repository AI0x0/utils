import { routeOperation, TypedNextResponse } from "next-rest-framework";
import { z } from "zod";
import { BaseTable } from "@/backend/types";
import getTableName from "@/backend/route-operation/get-table-name";
import { deleteActionFn } from "@/backend/actions";
import { NodePgDatabase } from "drizzle-orm/node-postgres";

export interface DeleteOperationOptions<TTable extends BaseTable> {
  table: TTable;
  summary?: string;
}
export const createDeleteOperation =
  <TTable extends BaseTable>({ db }: { db: NodePgDatabase<any> }) =>
  ({ table, summary }: DeleteOperationOptions<TTable>) =>
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
        return TypedNextResponse.json(await deleteActionFn({ table, db })(id), {
          status: 200,
        });
      }) as any;
