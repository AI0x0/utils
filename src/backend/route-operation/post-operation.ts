import { z, ZodSchema } from "zod";
import { PgTable } from "drizzle-orm/pg-core";
import { NextRequest } from "next/server";
import { routeOperation, TypedNextResponse } from "next-rest-framework";
import getTableName from "./get-table-name";
import {
  createOpenApiOperation,
  type RouteOpenApiOperation,
} from "./open-api-operation";
import { createPostAction } from "../actions";
import { NodePgDatabase } from "drizzle-orm/node-postgres";

async function readPostBody(
  req: NextRequest,
  {
    contentType,
    parseBody,
  }: {
    contentType: string;
    parseBody?: (req: NextRequest) => Promise<Record<string, unknown>>;
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

type PostOperationParams<IB extends ZodSchema> = z.infer<IB> &
  Record<string, unknown> & {
    creatorId?: string;
  };

export interface PostOperationOptions<
  IB extends ZodSchema,
  OB extends ZodSchema,
  TTable extends PgTable,
> {
  bodySchema: IB;
  contentType?: string;
  openApiOperation?: RouteOpenApiOperation;
  outputBodySchema?: OB;
  parseBody?(req: NextRequest): Promise<Record<string, unknown>>;
  setBody?(req: NextRequest): Promise<Partial<z.infer<IB>>>;
  onSuccess?(payload: {
    params: PostOperationParams<IB>;
    data: z.infer<OB>;
    req: NextRequest;
  }): Promise<z.infer<OB>>;
  onError?(
    error: Error,
  ): Promise<ReturnType<(typeof TypedNextResponse)["json"]> | undefined>;
  table?: TTable;
}

export const createPostOperation =
  ({
    getSession,
    db,
  }: {
    db?: NodePgDatabase<Record<string, unknown>>;
    getSession(req: NextRequest): Promise<{ userId?: string } | undefined>;
  }) =>
  <IB extends ZodSchema, OB extends ZodSchema, TTable extends PgTable>({
    bodySchema,
    contentType = "application/json",
    openApiOperation,
    outputBodySchema,
    parseBody,
    setBody,
    table,
    onSuccess,
    onError,
  }: PostOperationOptions<IB, OB, TTable>) =>
    routeOperation({
      method: "POST",
      openApiOperation: createOpenApiOperation({
        defaultTags: table ? [getTableName(table)] : [],
        openApiOperation,
      }),
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
                params: params as PostOperationParams<IB>,
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
