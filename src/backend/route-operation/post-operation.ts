import { z, ZodSchema } from "zod";
import { PgTable } from "drizzle-orm/pg-core";
import { NextRequest } from "next/server";
import { routeOperation, TypedNextResponse } from "next-rest-framework";
import getTableName from "./get-table-name";
import { createPostAction } from "../actions";
import { NodePgDatabase } from "drizzle-orm/node-postgres";

export interface PostOperationOptions<
  T extends ZodSchema,
  TTable extends PgTable,
> {
  bodySchema: T;
  setBody?: (req: NextRequest) => Promise<Partial<z.infer<T>>>;
  summary?: string;
  onSuccess?: (data: z.infer<T>) => Promise<z.infer<T>>;
  onError?: (
    error: Error,
  ) => Promise<ReturnType<(typeof TypedNextResponse)["json"]> | undefined>;
  table: TTable;
}

export const createPostOperation =
  ({
    getSession,
    db,
  }: {
    db: NodePgDatabase<any>;
    getSession: (req: NextRequest) => Promise<{ userId?: string } | undefined>;
  }) =>
  <T extends ZodSchema, TTable extends PgTable>({
    bodySchema,
    setBody,
    summary,
    table,
    onSuccess,
    onError,
  }: PostOperationOptions<T, TTable>) =>
    routeOperation({
      method: "POST",
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
          body: z.object({ id: z.string() }),
          contentType: "application/json",
          status: 200,
        },
      ])
      .handler(async (req) => {
        try {
          const { userId } = (await getSession(req)) || {};
          const body = Object.assign(
            await req.json(),
            (await setBody?.(req)) || {},
          );
          let [data] = await createPostAction({ bodySchema, db, table })({
            ...body,
            creatorId: userId,
          });
          if (onSuccess) {
            data = await onSuccess(data);
          }
          return TypedNextResponse.json(data, { status: 200 });
        } catch (e) {
          const response = await onError?.(e as Error);
          if (response) {
            return response as any;
          } else {
            throw e;
          }
        }
      }) as any;
