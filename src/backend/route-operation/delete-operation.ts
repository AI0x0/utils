import { routeOperation, TypedNextResponse } from "next-rest-framework";
import { z } from "zod";
import { BaseTable } from "@/backend/types";
import getTableName from "@/backend/route-operation/get-table-name";
import { createDeleteAction } from "@/backend/actions";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { NextRequest } from "next/server";
import { HttpError } from "@/backend/errors";

export interface DeleteOperationOptions<TTable extends BaseTable> {
  table: TTable;
  summary?: string;
  onSuccess?: () => Promise<void>;
  onError?: (
    error: Error,
  ) => Promise<ReturnType<(typeof TypedNextResponse)["json"]> | undefined>;
  byCreator?: boolean;
}
export const createDeleteOperation =
  ({
    db,
    getSession,
  }: {
    db: NodePgDatabase<Record<string, unknown>>;
    getSession: (req: NextRequest) => Promise<{ userId?: string } | undefined>;
  }) =>
  <TTable extends BaseTable>({
    table,
    summary,
    onSuccess,
    onError,
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
        try {
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
        } catch (e) {
          if (!(e instanceof HttpError)) console.error(e);
          const response = await onError?.(e as Error);
          if (response) {
            return response;
          }
          if (e instanceof HttpError) {
            return TypedNextResponse.json({ message: e.message } as never, {
              status: e.status,
            });
          }
          throw e;
        }
      });
