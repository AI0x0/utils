import type { NextRequest } from "next/server";
import type { ZodType } from "zod";

declare module "next-rest-framework" {
  type RouteHandler = (req: NextRequest) => Promise<Response>;

  interface RouteOperationBuilder {
    input: (opts: {
      body?: ZodType;
      query?: ZodType;
      contentType?: string;
    }) => RouteOperationBuilder;
    outputs: (
      opts: { body?: ZodType; status?: number; contentType?: string }[],
    ) => RouteOperationBuilder;
    handler: (fn: RouteHandler) => RouteHandler;
  }

  export const routeOperation: (opts: {
    method: string;
    openApiOperation?: { summary?: string; tags?: string[] };
  }) => RouteOperationBuilder;

  export const rpcOperation: () => {
    outputs: (opts: { body?: ZodType; contentType?: string }[]) => {
      handler: <T>(fn: () => Promise<T>) => () => Promise<T>;
    };
  };

  export const TypedNextResponse: {
    json: <T>(body: T, init?: { status?: number }) => Response;
  };

  export type TypedNextRequest<
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    M = string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    C = string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    B = unknown,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Q = Record<string, string>,
  > = NextRequest;
}
