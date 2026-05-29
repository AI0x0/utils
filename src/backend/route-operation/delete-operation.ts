import { routeOperation, TypedNextResponse } from "next-rest-framework";
import { z } from "zod";
import { BaseTable } from "@/backend/types";
import getTableName from "@/backend/route-operation/get-table-name";
import {
  createOpenApiOperation,
  type RouteOpenApiOperation,
} from "@/backend/route-operation/open-api-operation";
import { createDeleteAction } from "@/backend/actions";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { NextRequest } from "next/server";
import { HttpError } from "@/backend/errors";

const defaultDeleteBodySchema = z.object({
  id: z.string(),
});

type DeleteOperationParams<B extends z.ZodSchema> = z.infer<B> &
  Record<string, unknown> & {
    creatorId?: string;
    id: string;
  };

export interface DeleteOperationOptions<
  TTable extends BaseTable,
  B extends z.ZodSchema,
> {
  table?: TTable;
  bodySchema?: B;
  openApiOperation?: RouteOpenApiOperation;
  onSuccess?: (payload: {
    params: DeleteOperationParams<B>;
    data: unknown;
  }) => Promise<void>;
  onError?(
    error: Error,
  ): Promise<ReturnType<(typeof TypedNextResponse)["json"]> | undefined>;
  byCreator?: boolean;
}
export const createDeleteOperation =
  ({
    db,
    getSession,
  }: {
    db?: NodePgDatabase<Record<string, unknown>>;
    getSession(req: NextRequest): Promise<{ userId?: string } | undefined>;
  }) =>
  <
    TTable extends BaseTable,
    B extends z.ZodSchema = typeof defaultDeleteBodySchema,
  >({
    table,
    bodySchema = defaultDeleteBodySchema as unknown as B,
    openApiOperation,
    onSuccess,
    onError,
    byCreator = true,
  }: DeleteOperationOptions<TTable, B>) =>
    routeOperation({
      method: "DELETE",
      openApiOperation: createOpenApiOperation({
        defaultTags: table ? [getTableName(table)] : [],
        openApiOperation,
      }),
    })
      .input({
        body: bodySchema,
        contentType: "application/json",
      })
      .handler(async (req) => {
        try {
          const body = bodySchema.parse(
            await req.json(),
          ) as DeleteOperationParams<B>;
          if (byCreator) {
            const { userId } = (await getSession(req)) || {};
            body.creatorId = userId;
          }
          const tableParams = body as unknown as {
            id: string;
            creatorId?: string;
          };
          const data =
            table && db
              ? await createDeleteAction({ table, db })(tableParams)
              : body;
          await onSuccess?.({ data, params: body });
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
