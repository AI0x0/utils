import type { NextRequest } from "next/server";
import type { ZodType } from "zod";

declare module "next-rest-framework" {
  export interface RouteOperationDefinition<M extends string = string> {
    _method: M;
  }

  interface RouteOperationBuilder<M extends string> {
    input: (opts: {
      body?: ZodType;
      query?: ZodType;
      contentType?: string;
    }) => RouteOperationBuilder<M>;
    outputs: (
      opts: { body?: ZodType; status?: number; contentType?: string }[],
    ) => RouteOperationBuilder<M>;
    handler: (
      fn: (req: NextRequest) => Promise<Response>,
    ) => RouteOperationDefinition<M>;
  }

  export const routeOperation: <M extends string>(opts: {
    method: M;
    openApiOperation?: { summary?: string; tags?: string[] };
  }) => RouteOperationBuilder<M>;

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
