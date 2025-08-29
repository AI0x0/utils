import { routeOperation, TypedNextResponse } from "next-rest-framework";
import { z } from "zod";
import { BaseTable } from "@/backend/types";
import getTableName from "@/backend/route-operation/get-table-name";
import { createDeleteAction } from "@/backend/actions";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { NextRequest } from "next/server";

export interface DeleteOperationOptions<TTable extends BaseTable> {
  table: TTable;
  summary?: string;
  onSuccess?: () => Promise<void>;
  byCreator?: boolean;
}
export const createDeleteOperation =
  ({
    db,
    getSession,
  }: {
    db: NodePgDatabase<any>;
    getSession: (req: NextRequest) => Promise<{ userId?: string } | undefined>;
  }) =>
  <TTable extends BaseTable>({
    table,
    summary,
    onSuccess,
    byCreator = true,
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
        const body: {
          id: string;
          creatorId?: string;
        } = await req.json();
        if (byCreator) {
          const { userId } = (await getSession(req)) || {};
          body.creatorId = userId;
        }
        const data = await createDeleteAction({ table, db })(body);
        await onSuccess?.();
        return TypedNextResponse.json(data, {
          status: 200,
        });
      }) as any;
