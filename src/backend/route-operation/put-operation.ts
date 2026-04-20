import { z, ZodSchema } from "zod";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import {
  routeOperation,
  TypedNextRequest,
  TypedNextResponse,
} from "next-rest-framework";
import getTableName from "@/backend/route-operation/get-table-name";
import { createPutAction } from "@/backend/actions";
import { NextRequest } from "next/server";
import { BaseTable, AnyDatabase } from "@/backend/types";

export interface PutOperationOptions<
  IB extends ZodSchema,
  OB extends ZodSchema,
  TTable extends SQLiteTable,
> {
  bodySchema: IB;
  outputBodySchema?: OB;
  table: TTable;
  summary?: string;
  setBody?: (
    req: TypedNextRequest<"PUT", "application/json", z.infer<IB>>,
  ) => Promise<Partial<z.infer<IB>>>;
  onSuccess?: (data: z.infer<OB>) => Promise<z.infer<OB>>;
  onError?: (
    error: Error,
  ) => Promise<ReturnType<(typeof TypedNextResponse)["json"]> | undefined>;
  byCreator?: boolean;
}

export const createPutOperation =
  ({
    getSession,
    db,
  }: {
    getSession: (req: NextRequest) => Promise<{ userId?: string } | undefined>;
    db: AnyDatabase;
  }) =>
  <IB extends ZodSchema, OB extends ZodSchema, TTable extends BaseTable>({
    bodySchema,
    outputBodySchema,
    table,
    summary,
    setBody,
    onSuccess,
    byCreator = true,
    onError,
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
        try {
          const { userId } = (await getSession(req)) || {};
          const body = Object.assign(
            await req.json(),
            (await setBody?.(
              req as unknown as TypedNextRequest<
                "PUT",
                "application/json",
                z.infer<IB>
              >,
            )) || {},
          );
          const raw = await createPutAction({
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
          const data = onSuccess
            ? await onSuccess(raw as unknown as z.infer<OB>)
            : (raw as unknown as z.infer<OB>);
          return TypedNextResponse.json(data as z.infer<OB>, { status: 200 });
        } catch (e) {
          const response = await onError?.(e as Error);
          if (response) {
            return response;
          } else {
            throw e;
          }
        }
      });
