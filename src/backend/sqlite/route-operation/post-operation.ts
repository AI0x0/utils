import { z, ZodSchema } from "zod";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import { NextRequest } from "next/server";
import { routeOperation, TypedNextResponse } from "next-rest-framework";
import getTableName from "./get-table-name";
import { createPostAction } from "../actions";

async function readPostBody(
  req: NextRequest,
  {
    contentType,
    parseBody,
  }: {
    contentType: string;
    parseBody?: (_req: NextRequest) => Promise<Record<string, unknown>>;
  },
) {
  if (parseBody) {
    return parseBody(req);
  }
  if (contentType === "multipart/form-data") {
    return Object.fromEntries(await req.formData());
  }
  return (await req.json()) as Record<string, unknown>;
}

export interface PostOperationOptions<
  IB extends ZodSchema,
  OB extends ZodSchema,
  TTable extends SQLiteTable,
> {
  bodySchema: IB;
  contentType?: string;
  description?: string;
  outputBodySchema?: OB;
  parseBody?: (_req: NextRequest) => Promise<Record<string, unknown>>;
  setBody?: (_req: NextRequest) => Promise<Partial<z.infer<IB>>>;
  summary?: string;
  tags?: string[];
  onSuccess?: (_payload: {
    params: Record<string, unknown>;
    data: z.infer<OB>;
    req: NextRequest;
  }) => Promise<z.infer<OB>>;
  onError?: (
    _error: Error,
  ) => Promise<ReturnType<(typeof TypedNextResponse)["json"]> | undefined>;
  table?: TTable;
}

export const createPostOperation =
  ({
    getSession,
    db,
  }: {
    db?: any;
    getSession: (_req: NextRequest) => Promise<{ userId?: string } | undefined>;
  }) =>
  <IB extends ZodSchema, OB extends ZodSchema, TTable extends SQLiteTable>({
    bodySchema,
    contentType = "application/json",
    description,
    outputBodySchema,
    parseBody,
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
        description,
        summary,
        tags: tags ?? (table ? [getTableName(table)] : []),
      },
    })
      .input({
        body: bodySchema,
        contentType,
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
          const body = await readPostBody(req, { contentType, parseBody });
          const extraBody = (await setBody?.(req)) || {};
          const mergedBody = { ...body, ...extraBody } as unknown as Record<
            string,
            unknown
          >;
          const params = { creatorId: userId, ...mergedBody };
          const raw =
            table && db
              ? (
                  await createPostAction({ bodySchema, db, table })(
                    params as any,
                  )
                )[0]
              : (params as z.infer<OB>);
          const data = onSuccess
            ? await onSuccess({
                data: raw as unknown as z.infer<OB>,
                params,
                req,
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
