import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { pgTable, text } from "drizzle-orm/pg-core";
import { basicFields } from "@/backend/schemas";

type Operation = { _handler(req: any): Promise<any> };

vi.mock("next-rest-framework", () => {
  const makeBuilder = () => ({
    input: () => makeBuilder(),
    outputs: () => makeBuilder(),
    handler: (fn: any) => ({ _handler: fn }),
  });
  return {
    routeOperation: () => makeBuilder(),
    rpcOperation: () => ({
      outputs: () => ({ handler: (fn: any) => fn }),
    }),
    TypedNextResponse: {
      json: (data: any, init?: any) => ({ data, status: init?.status ?? 200 }),
    },
  };
});

vi.mock("next/server", () => ({
  NextRequest: class {},
}));

const testTable = pgTable("items", {
  ...basicFields,
  name: text("name"),
});

function makeDb(rows = [{ id: "id-1", name: "foo" }], count = "1") {
  const chain: any = {};
  chain.execute = vi.fn(async () => rows);
  chain.offset = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.groupBy = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);

  const countChain: any = {};
  countChain.execute = vi.fn(async () => [{ count }]);
  countChain.where = vi.fn(() => countChain);
  countChain.leftJoin = vi.fn(() => countChain);

  const returning = vi.fn(async () => rows);
  const values = vi.fn(() => ({ returning }));
  let selectCall = 0;

  return {
    delete: vi.fn(() => ({ where: vi.fn(() => ({ returning })) })),
    insert: vi.fn(() => ({ values })),
    select: vi.fn(() => {
      selectCall++;
      return {
        from: vi.fn(() => (selectCall % 2 === 1 ? chain : countChain)),
      };
    }),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(() => ({ returning })) })),
    })),
  } as any;
}

function makeReq(body: any = {}, query: Record<string, string> = {}) {
  const url =
    "http://localhost/api/items?" + new URLSearchParams(query).toString();
  return { json: vi.fn(async () => body), url } as any;
}

// ==============================================================================
// handler payload
// ==============================================================================
describe("route operation handler payload", () => {
  const getSession = vi.fn(async () => ({ userId: "user-1" }));

  it("deleteOperation 传入 { params, data }", async () => {
    const { createDeleteOperation } =
      await import("@/backend/route-operation/delete-operation");
    const handler = vi.fn(async () => {});
    const operation = createDeleteOperation({ db: makeDb(), getSession })({
      access: { byCreator: false },
      handler,
      table: testTable,
    }) as unknown as Operation;

    await operation._handler(makeReq({ id: "id-1" }));

    expect(handler).toHaveBeenCalledWith({
      data: [{ id: "id-1", name: "foo" }],
      params: { id: "id-1" },
      req: expect.any(Object),
    });
  });

  it("postOperation 可用 { params, data } 转换结果", async () => {
    const { createPostOperation } =
      await import("@/backend/route-operation/post-operation");
    const handler = vi.fn(async ({ data }: any) => ({
      ...data,
      extra: true,
    }));
    const operation = createPostOperation({ db: makeDb(), getSession })({
      schemas: { body: z.object({ name: z.string() }) },
      handler,
      table: testTable,
    }) as unknown as Operation;

    const res = await operation._handler(makeReq({ name: "test" }));

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { id: "id-1", name: "foo" },
        params: { creatorId: "user-1", name: "test" },
        req: expect.any(Object),
      }),
    );
    expect(res.data.extra).toBe(true);
  });

  it("getListOperation 可用 { params, data } 转换结果", async () => {
    const { createGetListOperation } =
      await import("@/backend/route-operation/get-list-operation");
    const handler = vi.fn(async ({ data }: any) => ({
      ...data,
      total: 999,
    }));
    const operation = createGetListOperation({ db: makeDb(), getSession })({
      handler,
      schemas: {
        query: z.object({}),
        response: z.object({ id: z.string(), name: z.string() }),
      },
      table: testTable,
    }) as unknown as Operation;

    const res = await operation._handler(makeReq());

    expect(handler).toHaveBeenCalledWith({
      data: { data: [{ id: "id-1", name: "foo" }], total: 1 },
      // 作用域不再混进 params：它单独传给 action，免得被「空值跳过筛选」那条规矩吃掉。
      params: {},
      req: expect.any(Object),
    });
    expect(res.data.total).toBe(999);
  });

  it("getOperation 可用 { params, data } 转换结果", async () => {
    const { createGetOperation } =
      await import("@/backend/route-operation/get-operation");
    const handler = vi.fn(async ({ data }: any) => ({
      ...data,
      extra: true,
    }));
    const operation = createGetOperation({ db: makeDb(), getSession })({
      handler,
      schemas: {
        query: z.object({}),
        response: z.object({ id: z.string(), name: z.string() }),
      },
      table: testTable,
    }) as unknown as Operation;

    const res = await operation._handler(makeReq());

    expect(handler).toHaveBeenCalledWith({
      data: { id: "id-1", name: "foo" },
      // 作用域不再混进 params：它单独传给 action，免得被「空值跳过筛选」那条规矩吃掉。
      params: {},
      req: expect.any(Object),
    });
    expect(res.data.extra).toBe(true);
  });

  it("putOperation 可用 { params, data } 转换结果", async () => {
    const { createPutOperation } =
      await import("@/backend/route-operation/put-operation");
    const handler = vi.fn(async ({ data }: any) => ({
      ...data,
      patched: true,
    }));
    const operation = createPutOperation({ db: makeDb(), getSession })({
      access: { byCreator: false },
      handler,
      schemas: { body: z.object({ id: z.string(), name: z.string() }) },
      table: testTable,
    }) as unknown as Operation;

    const res = await operation._handler(makeReq({ id: "id-1", name: "x" }));

    expect(handler).toHaveBeenCalledWith({
      data: { id: "id-1", name: "foo" },
      params: { editorId: "user-1", id: "id-1", name: "x" },
      req: expect.any(Object),
    });
    expect(res.data.patched).toBe(true);
  });
});
