import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

// ==============================================================================
// 归属戳不能被请求体盖掉
// ==============================================================================
// 这组用例守的是一条安全不变量：**一行归谁，由服务端的作用域说了算，客户端说什么都不算。**
//
// 为什么单靠 schema 拦不住（这也是这组用例存在的理由）：
//   · `.input({ body })` 只校验，**不替换**请求体 —— next-rest-framework 交给 handler 的是个
//     clone，它的 .json() 重新解析原始 JSON。所以 zod 本该 strip 掉的键照样到得了 handler；
//   · 而 createPostAction 是 `db.insert(table).values(transformBody(body))`，中间没有第二道
//     schema 过滤。
// 于是「把归属列从 insert schema 里 omit 掉」只是让它不出现在 OpenAPI 里，拦不住手写的请求。
// 真正的边界只能是组装顺序：服务端算出来的值必须**最后**展开。

type Operation = {
  _handler(req: any): Promise<any>;
};

vi.mock("next-rest-framework", () => {
  const makeBuilder = (ctx: any = {}) => ({
    input: (input: any) => makeBuilder({ ...ctx, _input: input }),
    outputs: () => makeBuilder(ctx),
    handler: (fn: any) => ({ _handler: fn, ...ctx }),
  });
  return {
    routeOperation: () => makeBuilder(),
    TypedNextResponse: {
      json: (data: any, init?: any) => ({ data, status: init?.status ?? 200 }),
    },
  };
});

vi.mock("next/server", () => ({
  NextRequest: class {},
}));

function makeJsonReq(body: Record<string, unknown>) {
  return {
    json: vi.fn(async () => body),
    url: "http://localhost/api/canvases",
  } as any;
}

describe("POST 的归属戳", () => {
  const getSession = vi.fn(async () => ({
    ownerId: "team-mine",
    userId: "user-1",
  }));

  it("请求体里塞归属列也盖不掉服务端算出来的作用域", async () => {
    const { createPostOperation } =
      await import("@/backend/route-operation/post-operation");
    const operation = createPostOperation({ getSession })({
      access: {
        scope: { column: "ownerId", value: (session: any) => session.ownerId },
      },
      schemas: { body: z.object({ name: z.string() }) },
    }) as unknown as Operation;

    // 手写的请求：body 里带一个**别人的**团队 id。
    const req = makeJsonReq({ name: "画布", ownerId: "team-victim" });
    const res = await operation._handler(req);

    expect(res.data.ownerId).toBe("team-mine");
    expect(res.data.name).toBe("画布");
  });

  it("默认作用域（creatorId）同理，伪造不了创建者", async () => {
    const { createPostOperation } =
      await import("@/backend/route-operation/post-operation");
    const operation = createPostOperation({
      getSession: vi.fn(async () => ({ userId: "user-1" })),
    })({
      schemas: { body: z.object({ name: z.string() }) },
    }) as unknown as Operation;

    const req = makeJsonReq({ creatorId: "user-victim", name: "条目" });
    const res = await operation._handler(req);

    expect(res.data.creatorId).toBe("user-1");
  });

  it("setBody 也盖不掉归属列 —— 它是用来补作者这类字段的，不该有改归属的能力", async () => {
    const { createPostOperation } =
      await import("@/backend/route-operation/post-operation");
    const operation = createPostOperation({ getSession })({
      access: {
        scope: { column: "ownerId", value: (session: any) => session.ownerId },
      },
      schemas: { body: z.object({ name: z.string() }) },
      setBody: async () =>
        ({ creatorId: "user-1", ownerId: "team-victim" }) as any,
    }) as unknown as Operation;

    const res = await operation._handler(makeJsonReq({ name: "画布" }));

    expect(res.data.ownerId).toBe("team-mine");
    // 作者这类**别的**列，setBody 照旧写得进去。
    expect(res.data.creatorId).toBe("user-1");
  });
});

describe("PUT 的 editorId", () => {
  it("请求体伪造不了「谁改的」", async () => {
    const { createPutOperation } =
      await import("@/backend/route-operation/put-operation");
    const operation = createPutOperation({
      getSession: vi.fn(async () => ({ userId: "user-1" })),
    })({
      schemas: { body: z.object({ id: z.string(), name: z.string() }) },
    }) as unknown as Operation;

    const req = makeJsonReq({
      editorId: "user-victim",
      id: "row-1",
      name: "改过的",
    });
    const res = await operation._handler(req);

    expect(res.data.editorId).toBe("user-1");
  });
});
