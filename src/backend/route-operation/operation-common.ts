import { NextRequest } from "next/server";
import { TypedNextRequest, TypedNextResponse } from "next-rest-framework";
import { z, ZodSchema } from "zod";

export type JsonResponse = ReturnType<(typeof TypedNextResponse)["json"]>;
export type RouteCatch = (error: Error) => Promise<JsonResponse | undefined>;
export type SessionGetter = (
  req: NextRequest,
) => Promise<{ userId?: string } | undefined>;

export type ActionFactory<TTable, TAction> = (_options: {
  bodySchema?: ZodSchema;
  db: unknown;
  jsonArrayFields?: string[];
  relations?: unknown;
  table: TTable;
}) => TAction;

type HttpLikeError = Error & {
  status?: number;
};

function isHttpLikeError(error: unknown): error is HttpLikeError {
  return (
    error instanceof Error &&
    error.name === "HttpError" &&
    typeof (error as HttpLikeError).status === "number"
  );
}

export async function handleOperationError(
  error: unknown,
  catchHandler?: RouteCatch,
) {
  if (!isHttpLikeError(error)) {
    console.error(error);
  }
  const response = await catchHandler?.(error as Error);
  if (response) {
    return response;
  }
  if (isHttpLikeError(error)) {
    return TypedNextResponse.json({ message: error.message } as never, {
      status: error.status,
    });
  }
  throw error;
}

export async function readPostBody(
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

export function getDefaultTags<TTable>({
  getTableName,
  table,
}: {
  getTableName(table: TTable): string;
  table?: TTable;
}) {
  return table ? [getTableName(table)] : [];
}

export type GetOperationParams<Q extends ZodSchema> = z.infer<Q> &
  Record<string, unknown> & {
    creatorId?: string;
  };

export async function getReadParams<Q extends ZodSchema>({
  access,
  getSession,
  req,
  schemas,
  setParams,
}: {
  access?: { byCreator?: boolean };
  getSession: SessionGetter;
  req: NextRequest;
  schemas: { query: Q };
  setParams?: (
    _req: TypedNextRequest<"GET", "application/json", unknown, z.infer<Q>>,
  ) => Promise<Record<string, unknown>>;
}) {
  const extraParams: Record<string, unknown> =
    (await setParams?.(
      req as unknown as TypedNextRequest<
        "GET",
        "application/json",
        unknown,
        z.infer<Q>
      >,
    )) || {};
  if (access?.byCreator ?? true) {
    const { userId } = (await getSession(req)) || {};
    extraParams.creatorId = userId;
  }
  const queryParams = schemas.query.parse(
    Object.fromEntries(new URL(req.url).searchParams),
  ) as z.infer<Q> & Record<string, unknown>;
  return { ...queryParams, ...extraParams } as GetOperationParams<Q>;
}
