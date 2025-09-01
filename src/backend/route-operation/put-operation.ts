import { z, ZodSchema } from "zod";
import { PgTable } from "drizzle-orm/pg-core";
import {
  routeOperation,
  TypedNextRequest,
  TypedNextResponse,
} from "next-rest-framework";
import getTableName from "@/backend/route-operation/get-table-name";
import { createPutAction } from "@/backend/actions";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { NextRequest } from "next/server";
import { BaseTable } from "@/backend/types";

export interface PutOperationOptions<
  IB extends ZodSchema,
  OB extends ZodSchema,
  TTable extends PgTable,
> {
  bodySchema: IB;
  outputBodySchema?: OB;
  table: TTable;
  summary?: string;
  setBody?: (
    req: TypedNextRequest<"PUT", "application/json", z.infer<IB>>,
  ) => Promise<Partial<z.infer<IB>>>;
  onSuccess?: (data: z.infer<OB>) => Promise<z.infer<OB>>;
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
  <IB extends ZodSchema, OB extends ZodSchema, TTable extends BaseTable>({
    bodySchema,
    outputBodySchema,
    table,
    summary,
    setBody,
    onSuccess,
    byCreator = true,
  }: PutOperationOptions<IB, OB, TTable>) =>
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
      .outputs([
        {
          body: outputBodySchema || z.void(),
          status: 200,
          contentType: "application/json",
        },
      ])
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
            editorId: userId,
            ...body,
          },
          { byCreator },
        );
        if (onSuccess) {
          data = await onSuccess(data);
        }
        return TypedNextResponse.json(data, { status: 200 });
      }) as any;
