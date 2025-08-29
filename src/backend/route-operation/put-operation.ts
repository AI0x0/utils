import { z, ZodSchema } from "zod";
import { PgTable } from "drizzle-orm/pg-core";
import { routeOperation, TypedNextResponse } from "next-rest-framework";
import getTableName from "@/backend/route-operation/get-table-name";
import { createPutAction } from "@/backend/actions";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { NextRequest } from "next/server";
import { BaseTable } from "@/backend/types";

export interface PutOperationOptions<
  T extends ZodSchema,
  TTable extends PgTable,
> {
  bodySchema: T;
  table: TTable;
  summary?: string;
  setBody?: (req: NextRequest) => Promise<Partial<z.infer<T>>>;
  onSuccess?: (data: z.infer<T>) => Promise<z.infer<T>>;
  byCreator?: boolean;
}

export const createPutOperation =
  ({
    getSession,
    db,
  }: {
    getSession: (req: NextRequest) => Promise<{ userId?: string } | undefined>;
    db: NodePgDatabase<any>;
  }) =>
  <T extends ZodSchema, TTable extends BaseTable>({
    bodySchema,
    table,
    summary,
    setBody,
    onSuccess,
    byCreator = true,
  }: PutOperationOptions<T, TTable>) =>
    routeOperation({
      method: "PUT",
      openApiOperation: {
        summary,
        tags: [getTableName(table)],
      },
    })
      .input({
        body: bodySchema,
        contentType: "application/json",
      })
      .handler(async (req) => {
        const { userId } = (await getSession(req)) || {};
        const body = Object.assign(
          await req.json(),
          (await setBody?.(req)) || {},
        );
        let data = await createPutAction({
          bodySchema,
          table,
          db,
        })(
          {
            ...body,
            editorId: userId,
          },
          { byCreator },
        );
        if (onSuccess) {
          data = await onSuccess(data);
        }
        return TypedNextResponse.json(data, { status: 200 });
      }) as any;
