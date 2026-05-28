import { z, ZodSchema } from "zod";
import { PgTable } from "drizzle-orm/pg-core";
import { NextRequest } from "next/server";
import {
  routeOperation,
  TypedNextRequest,
  TypedNextResponse,
} from "next-rest-framework";
import getTableName from "./get-table-name";
import { createPostAction } from "../actions";
import { NodePgDatabase } from "drizzle-orm/node-postgres";

export interface PostOperationOptions<
  IB extends ZodSchema,
  OB extends ZodSchema,
  TTable extends PgTable,
> {
  bodySchema: IB;
  outputBodySchema?: IB;
  setBody?(
    req: TypedNextRequest<"POST", "application/json", z.infer<IB>>,
  ): Promise<Partial<z.infer<IB>>>;
  summary?: string;
  tags?: string[];
  onSuccess?(payload: {
    params: Record<string, unknown>;
    data: z.infer<OB>;
  }): Promise<z.infer<OB>>;
  onError?(
    error: Error,
  ): Promise<ReturnType<(typeof TypedNextResponse)["json"]> | undefined>;
  table?: TTable;
}

export const createPostOperation: any =
  ({
    getSession,
    db,
  }: {
    db: NodePgDatabase<Record<string, unknown>>;
    getSession(req: NextRequest): Promise<{ userId?: string } | undefined>;
  }) =>
  <IB extends ZodSchema, OB extends ZodSchema, TTable extends PgTable>({
    bodySchema,
    outputBodySchema,
    setBody,
    summary,
    tags,
    table,
    onSuccess,
    onError,
  }: PostOperationOptions<IB, OB, TTable>) =>
    routeOperation({
      method: "POST",
      openApiOperation: {
        summary,
        tags: tags ?? (table ? [getTableName(table)] : []),
      },
    })
      .input({
        body: bodySchema,
        contentType: "application/json",
      })
      .outputs([
        {
          body: outputBodySchema || z.object({ id: z.string() }),
          contentType: "application/json",
          status: 200,
        },
      ])
      .handler(async (req) => {
        try {
          const { userId } = (await getSession(req)) || {};
          const body = (await req.json()) as Record<string, unknown>;
          const extraBody =
            (await setBody?.(
              req as unknown as TypedNextRequest<
                "POST",
                "application/json",
                z.infer<IB>
              >,
            )) || {};
          const mergedBody = { ...body, ...extraBody } as unknown as Record<
            string,
            unknown
          >;
          const params = { creatorId: userId, ...mergedBody };
          const raw = table
            ? (
                await createPostAction({ bodySchema, db, table })(params as any)
              )[0]
            : (params as z.infer<OB>);
          const data = onSuccess
            ? await onSuccess({
                data: raw as unknown as z.infer<OB>,
                params,
              })
            : (raw as unknown as z.infer<OB>);
          return TypedNextResponse.json(data as z.infer<OB>, {
            status: 200,
          }) as any;
        } catch (e) {
          console.error(e);
          const response = await onError?.(e as Error);
          if (response) {
            return response;
          } else {
            throw e;
          }
        }
      });
