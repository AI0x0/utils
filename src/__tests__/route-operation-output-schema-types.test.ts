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

// =============================================================================
// Route operation payload type regressions
// =============================================================================

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
      schemas: { body: bodySchema, response: outputBodySchema },
    });
    const sqliteOperation = createSqlitePostOperation({ getSession })({
      schemas: { body: bodySchema, response: outputBodySchema },
    });

    expect(operation).toBeDefined();
    expect(sqliteOperation).toBeDefined();
  }, 10000);

  it("postOperation 的 handler params 根据 bodySchema 推导", async () => {
    const { createPostOperation } =
      await import("@/backend/route-operation/post-operation");
    const { createPostOperation: createSqlitePostOperation } =
      await import("@/backend/sqlite/route-operation/post-operation");
    const bodySchema = z.object({
      mv: z.string().optional(),
      prompt: z.string(),
      tags: z.string(),
      title: z.string(),
    });
    const outputBodySchema = z.object({
      id: z.string(),
    });
    const getSession = vi.fn(async () => undefined);
    const createPayload = (input: z.infer<typeof bodySchema>) =>
      Promise.resolve({ id: input.title });

    const operation = createPostOperation({ getSession })({
      schemas: { body: bodySchema, response: outputBodySchema },
      handler: async ({ params }) => createPayload(params),
    });
    const sqliteOperation = createSqlitePostOperation({ getSession })({
      schemas: { body: bodySchema, response: outputBodySchema },
      handler: async ({ params }) => createPayload(params),
    });

    expect(operation).toBeDefined();
    expect(sqliteOperation).toBeDefined();
  }, 10000);

  it("getOperation 的 handler params 根据 querySchema 推导", async () => {
    const { createGetOperation } =
      await import("@/backend/route-operation/get-operation");
    const { createGetOperation: createSqliteGetOperation } =
      await import("@/backend/sqlite/route-operation/get-operation");
    const querySchema = z.object({
      logs: z.coerce.boolean().optional(),
      model: z.string().min(1),
      requestId: z.string().min(1),
    });
    const bodySchema = z.object({
      status: z.string(),
    });
    const getSession = vi.fn(async () => undefined);
    const getStatus = (input: z.infer<typeof querySchema>) =>
      Promise.resolve({ status: input.requestId });

    const operation = createGetOperation({ getSession })({
      schemas: { query: querySchema, response: bodySchema },
      handler: async ({ params }) => getStatus(params),
    });
    const sqliteOperation = createSqliteGetOperation({ getSession })({
      schemas: { query: querySchema, response: bodySchema },
      handler: async ({ params }) => getStatus(params),
    });

    expect(operation).toBeDefined();
    expect(sqliteOperation).toBeDefined();
  }, 10000);

  it("getListOperation 的 handler params 根据 querySchema 推导", async () => {
    const { createGetListOperation } =
      await import("@/backend/route-operation/get-list-operation");
    const { createGetListOperation: createSqliteGetListOperation } =
      await import("@/backend/sqlite/route-operation/get-list-operation");
    const querySchema = z.object({
      current: z.coerce.number().optional(),
      keyword: z.string().optional(),
      pageSize: z.coerce.number().optional(),
    });
    const bodySchema = z.object({
      id: z.string(),
      title: z.string(),
    });
    const getSession = vi.fn(async () => undefined);
    const getList = (input: z.infer<typeof querySchema>) =>
      Promise.resolve({
        data: [{ id: input.keyword || "id", title: "title" }],
        total: input.pageSize || 1,
      });

    const operation = createGetListOperation({ getSession })({
      schemas: { query: querySchema, response: bodySchema },
      handler: async ({ params }) => getList(params),
    });
    const sqliteOperation = createSqliteGetListOperation({ getSession })({
      schemas: { query: querySchema, response: bodySchema },
      handler: async ({ params }) => getList(params),
    });

    expect(operation).toBeDefined();
    expect(sqliteOperation).toBeDefined();
  }, 10000);

  it("deleteOperation 的 handler params 根据 bodySchema 推导", async () => {
    const { createDeleteOperation } =
      await import("@/backend/route-operation/delete-operation");
    const { createDeleteOperation: createSqliteDeleteOperation } =
      await import("@/backend/sqlite/route-operation/delete-operation");
    const bodySchema = z.object({
      id: z.string(),
      planId: z.string(),
    });
    const getSession = vi.fn(async () => undefined);
    const deleteDoc = (input: z.infer<typeof bodySchema>) => {
      expect(input.planId).toBeDefined();
      return Promise.resolve();
    };

    const operation = createDeleteOperation({ getSession })({
      schemas: { body: bodySchema },
      handler: async ({ params }) => deleteDoc(params),
    });
    const sqliteOperation = createSqliteDeleteOperation({ getSession })({
      schemas: { body: bodySchema },
      handler: async ({ params }) => deleteDoc(params),
    });

    expect(operation).toBeDefined();
    expect(sqliteOperation).toBeDefined();
  }, 10000);
});
