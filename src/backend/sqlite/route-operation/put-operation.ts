import { z, ZodSchema } from "zod";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import {
  routeOperation,
  TypedNextRequest,
  TypedNextResponse,
} from "next-rest-framework";
import getTableName from "@/backend/sqlite/route-operation/get-table-name";
import { createPutAction } from "@/backend/sqlite/actions";
import { NextRequest } from "next/server";
import { BaseTable } from "@/backend/sqlite/types";
import { HttpError } from "@/backend/sqlite/errors";

export interface PutOperationOptions<
  IB extends ZodSchema,
  OB extends ZodSchema,
  TTable extends SQLiteTable,
> {
  bodySchema: IB;
  outputBodySchema?: OB;
  table?: TTable;
  summary?: string;
  setBody?: (
    _req: TypedNextRequest<"PUT", "application/json", z.infer<IB>>,
  ) => Promise<Partial<z.infer<IB>>>;
  onSuccess?: (_data: z.infer<OB>) => Promise<z.infer<OB>>;
  onError?: (
    _error: Error,
  ) => Promise<ReturnType<(typeof TypedNextResponse)["json"]> | undefined>;
  byCreator?: boolean;
}

export const createPutOperation: any =
  ({
    getSession,
    db,
  }: {
    getSession: (_req: NextRequest) => Promise<{ userId?: string } | undefined>;
    db: any;
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
        tags: table ? [getTableName(table)] : [],
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
          const body = (await req.json()) as Record<string, unknown>;
          const extraBody =
            (await setBody?.(
              req as unknown as TypedNextRequest<
                "PUT",
                "application/json",
                z.infer<IB>
              >,
            )) || {};
          const mergedBody = { ...body, ...extraBody } as unknown as Record<
            string,
            unknown
          >;
          const raw = table
            ? await createPutAction({
                bodySchema,
                table,
                db,
              })({ editorId: userId, ...mergedBody } as any, { byCreator })
            : ({ editorId: userId, ...mergedBody } as z.infer<OB>);
          const data = onSuccess
            ? await onSuccess(raw as unknown as z.infer<OB>)
            : (raw as unknown as z.infer<OB>);
          return TypedNextResponse.json(data as z.infer<OB>, {
            status: 200,
          }) as any;
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
