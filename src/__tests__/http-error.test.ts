// =============================================================================
// 框架内建报错文案：默认中文 / resolver 覆盖 / 恢复默认 / resolver 抛错回落
// =============================================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { pgTable, text } from "drizzle-orm/pg-core";
import { basicFields } from "@/backend/schemas";

type Operation = { _handler: (req: any) => Promise<any> };

vi.mock("@ai0x0/next-rest-framework", () => {
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
  NextResponse: { json: (data: any) => data },
}));

// 让 createGetAction 返回 undefined，模拟「未找到/无权限」
vi.mock("@/backend", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    createGetAction: () => async () => undefined,
  };
});

const testTable = pgTable("items", {
  ...basicFields,
  name: text("name"),
});

function makeDb() {
  const chain: any = {};
  chain.execute = vi.fn(async () => []);
  chain.offset = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.groupBy = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);

  const countChain: any = {};
  countChain.execute = vi.fn(async () => [{ count: "0" }]);
  countChain.where = vi.fn(() => countChain);
  countChain.leftJoin = vi.fn(() => countChain);

  const returning = vi.fn(async () => []);
  let selectCall = 0;
  return {
    delete: vi.fn(() => ({ where: vi.fn(() => ({ returning })) })),
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

function makeReq(body: any = {}) {
  return {
    json: vi.fn(async () => body),
    url: "http://localhost/api/items",
  } as any;
}

describe("HttpError 返回正确状态码", () => {
  const getSession = vi.fn(async () => ({ userId: "user-1" }));
  beforeEach(() => getSession.mockClear());

  it("DELETE 未找到对象或无权限时返回 404", async () => {
    const { createDeleteOperation } =
      await import("@/backend/route-operation/delete-operation");
    const db = makeDb();
    const operation = createDeleteOperation({ db, getSession })({
      table: testTable,
      access: { byCreator: true },
    });
    const res = await (operation as unknown as Operation)._handler(
      makeReq({ id: "id-1" }),
    );
    expect(res.status).toBe(404);
    expect(res.data.message).toBe("未找到删除对象，或没有权限");
    // 归属条件现在写进 DELETE 的 where，所以语句是**发出去**的，只是影响 0 行。
    // 从前是「先 select 验权、再无条件 delete」——那多一次往返，而且两步之间归属可能已经变了。
    expect(db.delete).toHaveBeenCalled();
  });

  it("PUT 未找到对象或无权限时返回 404", async () => {
    const { createPutOperation } =
      await import("@/backend/route-operation/put-operation");
    const db = makeDb();
    const bodySchema = z.object({ id: z.string(), name: z.string() });
    const operation = createPutOperation({ db, getSession })({
      schemas: { body: bodySchema },
      table: testTable,
      access: { byCreator: true },
    });
    const res = await (operation as unknown as Operation)._handler(
      makeReq({ id: "id-1", name: "x" }),
    );
    expect(res.status).toBe(404);
    expect(res.data.message).toBe("未找到编辑对象，或没有权限");
    // 同 DELETE：一条 UPDATE 带着归属条件，影响 0 行即 404。
    expect(db.update).toHaveBeenCalled();
  });

  it("DELETE catch 优先于 HttpError 默认处理", async () => {
    const { createDeleteOperation } =
      await import("@/backend/route-operation/delete-operation");
    const db = makeDb();
    const catchHandler = vi.fn(async () => ({
      data: { custom: true },
      status: 418,
    }));
    const operation = createDeleteOperation({ db, getSession })({
      table: testTable,
      access: { byCreator: true },
      catch: catchHandler as never,
    });
    const res = await (operation as unknown as Operation)._handler(
      makeReq({ id: "id-1" }),
    );
    expect(catchHandler).toHaveBeenCalled();
    expect(res.status).toBe(418);
  });
});

describe("httpErrorMessages 解析器", () => {
  beforeEach(async () => {
    const { setHttpErrorMessageResolver } = await import("@/backend/errors");
    setHttpErrorMessageResolver(undefined);
  });

  it("注册解析器后，库内建报错按它出文案", async () => {
    const { setHttpErrorMessageResolver } = await import("@/backend/errors");
    setHttpErrorMessageResolver(() => ({
      deleteNotFound: "Not found, or not yours",
    }));
    const { createDeleteOperation } =
      await import("@/backend/route-operation/delete-operation");
    const db = makeDb();
    const operation = createDeleteOperation({
      db,
      getSession: async () => ({ userId: "user-1" }),
    })({
      table: testTable,
      access: { byCreator: true },
    });
    const res = await (operation as unknown as Operation)._handler(
      makeReq({ id: "id-1" }),
    );
    expect(res.status).toBe(404);
    expect(res.data.message).toBe("Not found, or not yours");
  });

  it("解析器支持 async（按当前请求取语言的场景）", async () => {
    const { setHttpErrorMessageResolver } = await import("@/backend/errors");
    setHttpErrorMessageResolver(async () => ({
      unauthenticated: "Not signed in",
    }));
    const { createDeleteOperation } =
      await import("@/backend/route-operation/delete-operation");
    const operation = createDeleteOperation({
      db: makeDb(),
      getSession: async () => undefined,
    })({
      table: testTable,
      access: { byCreator: true },
    });
    const res = await (operation as unknown as Operation)._handler(
      makeReq({ id: "id-1" }),
    );
    expect(res.status).toBe(401);
    expect(res.data.message).toBe("Not signed in");
  });

  it("解析器自己抛错时回落默认中文，不吞掉原本的 401", async () => {
    const { setHttpErrorMessageResolver } = await import("@/backend/errors");
    setHttpErrorMessageResolver(() => {
      throw new Error("messages not loaded");
    });
    const { createDeleteOperation } =
      await import("@/backend/route-operation/delete-operation");
    const operation = createDeleteOperation({
      db: makeDb(),
      getSession: async () => undefined,
    })({
      table: testTable,
      access: { byCreator: true },
    });
    const res = await (operation as unknown as Operation)._handler(
      makeReq({ id: "id-1" }),
    );
    expect(res.status).toBe(401);
    expect(res.data.message).toBe("未登录");
  });

  it("没注册解析器时文案与从前逐字一致", async () => {
    const { createPutOperation } =
      await import("@/backend/route-operation/put-operation");
    const db = makeDb();
    const bodySchema = z.object({ id: z.string(), name: z.string() });
    const operation = createPutOperation({
      db,
      getSession: async () => ({ userId: "user-1" }),
    })({
      schemas: { body: bodySchema },
      table: testTable,
      access: { byCreator: true },
    });
    const res = await (operation as unknown as Operation)._handler(
      makeReq({ name: "x" }),
    );
    expect(res.status).toBe(400);
    expect(res.data.message).toBe("缺少 id");
  });
});
