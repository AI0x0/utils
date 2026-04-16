import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { pgTable, text } from "drizzle-orm/pg-core";
import { basicFields } from "@/backend/schemas";

type Operation = { _handler: (req: any) => Promise<any> };

// ─── mock next-rest-framework ────────────────────────────────────────────────
vi.mock("next-rest-framework", () => {
  const makeBuilder = (ctx: any = {}) => ({
    input: () => makeBuilder(ctx),
    outputs: () => makeBuilder(ctx),
    handler: (fn: any) => ({ _handler: fn, ...ctx }),
  });
  return {
    routeOperation: () => makeBuilder(),
    TypedNextResponse: {
      json: (data: any, init?: any) => ({ data, status: init?.status ?? 200 }),
    },
    rpcOperation: () => ({
      outputs: () => ({ handler: (fn: any) => fn }),
    }),
  };
});

vi.mock("next/server", () => ({
  NextRequest: class {},
  NextResponse: { json: (d: any) => d },
}));

// mock @/backend 避免 createDeleteAction 内部调用 createGetAction 出错
vi.mock("@/backend", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    createGetAction: () => () => async () => ({
      id: "id-1",
      creatorId: "user-1",
    }),
  };
});

// ─── test table ──────────────────────────────────────────────────────────────
const testTable = pgTable("items", {
  ...basicFields,
  name: text("name"),
});

// ─── mock db ─────────────────────────────────────────────────────────────────
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
    select: vi.fn(() => {
      selectCall++;
      return {
        from: vi.fn(() => (selectCall % 2 === 1 ? chain : countChain)),
      };
    }),
    insert: vi.fn(() => ({ values })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(() => ({ returning })) })),
    })),
    delete: vi.fn(() => ({ where: vi.fn(() => ({ returning })) })),
    _returning: returning,
    _values: values,
  } as any;
}

function makeReq(body: any = {}, query: Record<string, string> = {}) {
  const url =
    "http://localhost/api/items?" + new URLSearchParams(query).toString();
  return { json: vi.fn(async () => body), url } as any;
}

// ─── createDeleteOperation ────────────────────────────────────────────────────
describe("createDeleteOperation", () => {
  const getSession = vi.fn(async () => ({ userId: "user-1" }));
  beforeEach(() => getSession.mockClear());

  it("byCreator=false 直接删除返回 200", async () => {
    const { createDeleteOperation } =
      await import("@/backend/route-operation/delete-operation");
    const db = makeDb();
    const operation = createDeleteOperation({ db, getSession })({
      table: testTable,
      byCreator: false,
    });
    const res = await (operation as unknown as Operation)._handler(
      makeReq({ id: "id-1" }),
    );
    expect(res.status).toBe(200);
    expect(getSession).not.toHaveBeenCalled();
  });

  it("byCreator=true 时调用 getSession", async () => {
    const { createDeleteOperation } =
      await import("@/backend/route-operation/delete-operation");
    const db = makeDb();
    const operation = createDeleteOperation({ db, getSession })({
      table: testTable,
      byCreator: true,
    });
    // byCreator=true 时内部传 creatorId，createDeleteAction 会先 get 验权
    // 这里 db.select 返回的 rows=[{id:'id-1'}] 可以找到记录，delete 正常执行
    await (operation as unknown as Operation)._handler(makeReq({ id: "id-1" }));
    expect(getSession).toHaveBeenCalled();
  });

  it("onSuccess 回调被调用", async () => {
    const { createDeleteOperation } =
      await import("@/backend/route-operation/delete-operation");
    const db = makeDb();
    const onSuccess = vi.fn(async () => {});
    const operation = createDeleteOperation({ db, getSession })({
      table: testTable,
      byCreator: false,
      onSuccess,
    });
    await (operation as unknown as Operation)._handler(makeReq({ id: "id-1" }));
    expect(onSuccess).toHaveBeenCalled();
  });

  it("onError 拦截异常并返回自定义响应", async () => {
    const { createDeleteOperation } =
      await import("@/backend/route-operation/delete-operation");
    const db = makeDb();
    db.delete = vi.fn(() => {
      throw new Error("db error");
    });

    const onError = vi.fn(async () => ({ data: null, status: 500 })) as any;
    const operation = createDeleteOperation({ db, getSession })({
      table: testTable,
      byCreator: false,
      onError,
    });
    const res = await (operation as unknown as Operation)._handler(
      makeReq({ id: "id-1" }),
    );
    expect(onError).toHaveBeenCalled();
    expect(res.status).toBe(500);
  });

  it("onError 未定义时抛出异常", async () => {
    const { createDeleteOperation } =
      await import("@/backend/route-operation/delete-operation");
    const db = makeDb();
    db.delete = vi.fn(() => {
      throw new Error("raw error");
    });
    const operation = createDeleteOperation({ db, getSession })({
      table: testTable,
      byCreator: false,
    });
    await expect(
      (operation as unknown as Operation)._handler(makeReq({ id: "id-1" })),
    ).rejects.toThrow("raw error");
  });
});

// ─── createPostOperation ──────────────────────────────────────────────────────
describe("createPostOperation", () => {
  const getSession = vi.fn(async () => ({ userId: "user-1" }));
  beforeEach(() => getSession.mockClear());

  it("成功插入并返回 200", async () => {
    const { createPostOperation } =
      await import("@/backend/route-operation/post-operation");
    const db = makeDb();
    const bodySchema = z.object({ name: z.string() });
    const operation = createPostOperation({ db, getSession })({
      bodySchema,
      table: testTable,
    });
    const res = await (operation as unknown as Operation)._handler(
      makeReq({ name: "test" }),
    );
    expect(res.status).toBe(200);
    expect(db.insert).toHaveBeenCalled();
  });

  it("调用 setBody 合并额外字段", async () => {
    const { createPostOperation } =
      await import("@/backend/route-operation/post-operation");
    const db = makeDb();
    const bodySchema = z.object({ name: z.string() });
    const setBody = vi.fn(async () => ({ extra: "value" })) as never;
    const operation = createPostOperation({ db, getSession })({
      bodySchema,
      table: testTable,
      setBody,
    });
    await (operation as unknown as Operation)._handler(
      makeReq({ name: "test" }),
    );
    expect(setBody).toHaveBeenCalled();
  });

  it("onSuccess 转换返回数据", async () => {
    const { createPostOperation } =
      await import("@/backend/route-operation/post-operation");
    const db = makeDb();
    const bodySchema = z.object({ name: z.string() });
    const onSuccess = vi.fn(async (d: any) => ({ ...d, extra: true }));
    const operation = createPostOperation({ db, getSession })({
      bodySchema,
      table: testTable,
      onSuccess,
    });
    const res = await (operation as unknown as Operation)._handler(
      makeReq({ name: "test" }),
    );
    expect(onSuccess).toHaveBeenCalled();
    expect(res.data.extra).toBe(true);
  });

  it("onError 拦截异常", async () => {
    const { createPostOperation } =
      await import("@/backend/route-operation/post-operation");
    const db = makeDb();
    db.insert = vi.fn(() => {
      throw new Error("fail");
    });

    const onError = vi.fn(async () => ({ data: null, status: 500 })) as any;
    const bodySchema = z.object({ name: z.string() });
    const operation = createPostOperation({ db, getSession })({
      bodySchema,
      table: testTable,
      onError,
    });
    const res = await (operation as unknown as Operation)._handler(
      makeReq({ name: "x" }),
    );
    expect(onError).toHaveBeenCalled();
    expect(res.status).toBe(500);
  });
});

// ─── createGetListOperation ───────────────────────────────────────────────────
describe("createGetListOperation", () => {
  const getSession = vi.fn(async () => ({ userId: "user-1" }));
  beforeEach(() => getSession.mockClear());

  it("成功查询返回 200", async () => {
    const { createGetListOperation } =
      await import("@/backend/route-operation/get-list-operation");
    const db = makeDb();
    const bodySchema = z.object({ id: z.string(), name: z.string() });
    const querySchema = z.object({ current: z.string().optional() });
    const operation = createGetListOperation({ db, getSession })({
      bodySchema,
      querySchema,
      table: testTable,
    });
    const res = await (operation as unknown as Operation)._handler(makeReq());
    expect(res.status).toBe(200);
  });

  it("onSuccess 可转换结果", async () => {
    const { createGetListOperation } =
      await import("@/backend/route-operation/get-list-operation");
    const db = makeDb();
    const bodySchema = z.object({ id: z.string(), name: z.string() });
    const querySchema = z.object({});
    const onSuccess = vi.fn(async (r: any) => ({ ...r, total: 999 }));
    const operation = createGetListOperation({ db, getSession })({
      bodySchema,
      querySchema,
      table: testTable,
      onSuccess,
    });
    const res = await (operation as unknown as Operation)._handler(makeReq());
    expect(onSuccess).toHaveBeenCalled();
    expect(res.data.total).toBe(999);
  });

  it("onError 拦截异常", async () => {
    const { createGetListOperation } =
      await import("@/backend/route-operation/get-list-operation");
    const db = makeDb();
    db.select = vi.fn(() => {
      throw new Error("fail");
    });

    const onError = vi.fn(async () => ({ data: null, status: 500 })) as any;
    const bodySchema = z.object({ id: z.string() });
    const querySchema = z.object({});
    const operation = createGetListOperation({ db, getSession })({
      bodySchema,
      querySchema,
      table: testTable,
      onError,
    });
    const res = await (operation as unknown as Operation)._handler(makeReq());
    expect(onError).toHaveBeenCalled();
    expect(res.status).toBe(500);
  });
});

// ─── createGetOperation ───────────────────────────────────────────────────────
describe("createGetOperation", () => {
  const getSession = vi.fn(async () => ({ userId: "user-1" }));
  beforeEach(() => getSession.mockClear());

  it("成功查询返回 200", async () => {
    const { createGetOperation } =
      await import("@/backend/route-operation/get-operation");
    const db = makeDb();
    const bodySchema = z.object({ id: z.string(), name: z.string() });
    const querySchema = z.object({ id: z.string().optional() });
    const operation = createGetOperation({ db, getSession })({
      bodySchema,
      querySchema,
      table: testTable,
    });
    const res = await (operation as unknown as Operation)._handler(
      makeReq({}, { id: "id-1" }),
    );
    expect(res.status).toBe(200);
  });

  it("onSuccess 转换结果", async () => {
    const { createGetOperation } =
      await import("@/backend/route-operation/get-operation");
    const db = makeDb();
    const bodySchema = z.object({ id: z.string(), name: z.string() });
    const querySchema = z.object({});
    const onSuccess = vi.fn(async (d: any) => ({ ...d, extra: true }));
    const operation = createGetOperation({ db, getSession })({
      bodySchema,
      querySchema,
      table: testTable,
      onSuccess,
    });
    const res = await (operation as unknown as Operation)._handler(makeReq());
    expect(onSuccess).toHaveBeenCalled();
    expect(res.data.extra).toBe(true);
  });

  it("onError 拦截异常", async () => {
    const { createGetOperation } =
      await import("@/backend/route-operation/get-operation");
    const db = makeDb();
    db.select = vi.fn(() => {
      throw new Error("fail");
    });

    const onError = vi.fn(async () => ({ data: null, status: 500 })) as any;
    const bodySchema = z.object({ id: z.string() });
    const querySchema = z.object({});
    const operation = createGetOperation({ db, getSession })({
      bodySchema,
      querySchema,
      table: testTable,
      onError,
    });
    const res = await (operation as unknown as Operation)._handler(makeReq());
    expect(onError).toHaveBeenCalled();
    expect(res.status).toBe(500);
  });
});

// ─── createPutOperation ───────────────────────────────────────────────────────
describe("createPutOperation", () => {
  const getSession = vi.fn(async () => ({ userId: "user-1" }));
  beforeEach(() => getSession.mockClear());

  it("byCreator=false 直接更新返回 200", async () => {
    const { createPutOperation } =
      await import("@/backend/route-operation/put-operation");
    const db = makeDb();
    const bodySchema = z.object({ id: z.string(), name: z.string() });
    const operation = createPutOperation({ db, getSession })({
      bodySchema,
      table: testTable,
      byCreator: false,
    });
    const res = await (operation as unknown as Operation)._handler(
      makeReq({ id: "id-1", name: "updated" }),
    );
    expect(res.status).toBe(200);
    expect(db.update).toHaveBeenCalled();
  });

  it("setBody 合并额外字段", async () => {
    const { createPutOperation } =
      await import("@/backend/route-operation/put-operation");
    const db = makeDb();
    const bodySchema = z.object({ id: z.string(), name: z.string() });
    const setBody = vi.fn(async () => ({ extra: "v" })) as never;
    const operation = createPutOperation({ db, getSession })({
      bodySchema,
      table: testTable,
      byCreator: false,
      setBody,
    });
    await (operation as unknown as Operation)._handler(
      makeReq({ id: "id-1", name: "x" }),
    );
    expect(setBody).toHaveBeenCalled();
  });

  it("onSuccess 转换结果", async () => {
    const { createPutOperation } =
      await import("@/backend/route-operation/put-operation");
    const db = makeDb();
    const bodySchema = z.object({ id: z.string(), name: z.string() });
    const onSuccess = vi.fn(async (d: any) => ({ ...d, patched: true }));
    const operation = createPutOperation({ db, getSession })({
      bodySchema,
      table: testTable,
      byCreator: false,
      onSuccess,
    });
    const res = await (operation as unknown as Operation)._handler(
      makeReq({ id: "id-1", name: "x" }),
    );
    expect(onSuccess).toHaveBeenCalled();
    expect(res.data.patched).toBe(true);
  });

  it("onError 拦截异常", async () => {
    const { createPutOperation } =
      await import("@/backend/route-operation/put-operation");
    const db = makeDb();
    db.update = vi.fn(() => {
      throw new Error("fail");
    });

    const onError = vi.fn(async () => ({ data: null, status: 500 })) as any;
    const bodySchema = z.object({ id: z.string(), name: z.string() });
    const operation = createPutOperation({ db, getSession })({
      bodySchema,
      table: testTable,
      byCreator: false,
      onError,
    });
    const res = await (operation as unknown as Operation)._handler(
      makeReq({ id: "id-1", name: "x" }),
    );
    expect(onError).toHaveBeenCalled();
    expect(res.status).toBe(500);
  });
});
