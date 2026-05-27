/* eslint-disable no-unused-vars */
import { routeOperation, TypedNextResponse } from "next-rest-framework";
import { z } from "zod";
import { BaseTable } from "@/backend/sqlite/types";
import getTableName from "@/backend/sqlite/route-operation/get-table-name";
import { createDeleteAction } from "@/backend/sqlite/actions";
import { NextRequest } from "next/server";
import { HttpError } from "@/backend/sqlite/errors";

export interface DeleteOperationOptions<TTable extends BaseTable> {
  table: TTable;
  summary?: string;
  onSuccess?: () => Promise<void>;
  onError?: (
    _error: Error,
  ) => Promise<ReturnType<(typeof TypedNextResponse)["json"]> | undefined>;
  byCreator?: boolean;
}
export const createDeleteOperation: any =
  ({
    db,
    getSession,
  }: {
    db: any;
    getSession: (_req: NextRequest) => Promise<{ userId?: string } | undefined>;
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
          if (!(e instanceof HttpError)) {
            console.error(e);
          }
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
