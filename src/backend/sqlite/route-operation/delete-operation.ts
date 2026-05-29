import { routeOperation, TypedNextResponse } from "next-rest-framework";
import { z } from "zod";
import { BaseTable } from "@/backend/sqlite/types";
import getTableName from "@/backend/sqlite/route-operation/get-table-name";
import { createDeleteAction } from "@/backend/sqlite/actions";
import { NextRequest } from "next/server";
import { HttpError } from "@/backend/sqlite/errors";

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
  description?: string;
  summary?: string;
  tags?: string[];
  onSuccess?: (_payload: {
    params: DeleteOperationParams<B>;
    data: unknown;
  }) => Promise<void>;
  onError?: (
    _error: Error,
  ) => Promise<ReturnType<(typeof TypedNextResponse)["json"]> | undefined>;
  byCreator?: boolean;
}
export const createDeleteOperation =
  ({
    db,
    getSession,
  }: {
    db?: any;
    getSession: (_req: NextRequest) => Promise<{ userId?: string } | undefined>;
  }) =>
  <
    TTable extends BaseTable,
    B extends z.ZodSchema = typeof defaultDeleteBodySchema,
  >({
    table,
    bodySchema = defaultDeleteBodySchema as unknown as B,
    description,
    summary,
    tags,
    onSuccess,
    onError,
    byCreator = true,
  }: DeleteOperationOptions<TTable, B>) =>
    routeOperation({
      method: "DELETE",
      openApiOperation: {
        description,
        summary,
        tags: tags ?? (table ? [getTableName(table)] : []),
      },
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
