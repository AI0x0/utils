import { z, ZodSchema } from "zod";
import { NextRequest } from "next/server";
import {
  routeOperation,
  TypedNextRequest,
  TypedNextResponse,
} from "next-rest-framework";
import getTableName from "./get-table-name";
import { createGetAction } from "../actions";
import { BaseTable, GetListRelations } from "@/backend/sqlite/types";

export interface GetOperationOptions<
  T extends ZodSchema,
  Q extends ZodSchema,
  TTable extends BaseTable,
> {
  bodySchema: T;
  jsonArrayFields?: string[];
  querySchema: Q;
  relations?: GetListRelations;
  setParams?: (
    _req: TypedNextRequest<"GET", "application/json", unknown, z.infer<Q>>,
  ) => Promise<Record<string, unknown>>;
  onSuccess?: (_payload: {
    params: Partial<z.infer<T>> & Record<string, unknown>;
    data: z.infer<T>;
  }) => Promise<z.infer<T>>;
  onError?: (
    _error: Error,
  ) => Promise<ReturnType<(typeof TypedNextResponse)["json"]> | undefined>;
  summary?: string;
  tags?: string[];
  table?: TTable;
  byCreator?: boolean;
}

export const createGetOperation: any =
  ({
    getSession,
    db,
  }: {
    db?: any;
    getSession: (_req: NextRequest) => Promise<{ userId?: string } | undefined>;
  }) =>
  <T extends ZodSchema, Q extends ZodSchema, TTable extends BaseTable>({
    querySchema,
    bodySchema,
    table,
    summary,
    tags,
    relations,
    setParams,
    jsonArrayFields,
    onSuccess,
    onError,
    byCreator = true,
  }: GetOperationOptions<T, Q, TTable>) =>
    routeOperation({
      method: "GET",
      openApiOperation: {
        summary,
        tags: tags ?? (table ? [getTableName(table)] : []),
      },
    })
      .input({
        query: querySchema as unknown as z.ZodType<
          Record<string, string | string[]>
        >,
      })
      .outputs([
        {
          body: bodySchema,
          contentType: "application/json",
          status: 200,
        },
      ])
      .handler(async (req) => {
        try {
          const params: Record<string, unknown> =
            (await setParams?.(
              req as unknown as TypedNextRequest<
                "GET",
                "application/json",
                unknown,
                z.infer<Q>
              >,
            )) || {};
          if (byCreator) {
            const { userId } = (await getSession(req)) || {};
            params.creatorId = userId;
          }

          const mergedParams = Object.assign(
            Object.fromEntries(new URL(req.url).searchParams),
            params,
          ) as Partial<z.infer<T>> & Record<string, unknown>;
          const rawResult =
            table && db
              ? await createGetAction({
                  bodySchema,
                  db,
                  jsonArrayFields,
                  relations,
                  table,
                })(mergedParams)
              : mergedParams;
          let result = (rawResult ?? ({} as z.infer<T>)) as z.infer<T>;
          if (onSuccess) {
            result = await onSuccess({ data: result, params: mergedParams });
          }
          return TypedNextResponse.json(result as z.infer<T>, {
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
