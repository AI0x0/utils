import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("next-rest-framework", () => {
  const makeBuilder = () => ({
    input: () => makeBuilder(),
    outputs: () => makeBuilder(),
    handler: (fn: unknown) => ({ _handler: fn }),
  });

  return {
    routeOperation: () => makeBuilder(),
    TypedNextResponse: {
      json: (data: unknown, init?: { status?: number }) => ({
        data,
        status: init?.status ?? 200,
      }),
    },
  };
});

vi.mock("next/server", () => ({
  NextRequest: class {},
}));

describe("route operation output schema types", () => {
  it("postOperation 支持入参和出参使用不同 schema", async () => {
    const { createPostOperation } =
      await import("@/backend/route-operation/post-operation");
    const { createPostOperation: createSqlitePostOperation } =
      await import("@/backend/sqlite/route-operation/post-operation");
    const bodySchema = z.object({
      name: z.string(),
    });
    const outputBodySchema = z.object({
      id: z.string(),
      title: z.string(),
    });
    const getSession = vi.fn(async () => undefined);

    const operation = createPostOperation({ getSession })({
      bodySchema,
      outputBodySchema,
    });
    const sqliteOperation = createSqlitePostOperation({ getSession })({
      bodySchema,
      outputBodySchema,
    });

    expect(operation).toBeDefined();
    expect(sqliteOperation).toBeDefined();
  });
});
