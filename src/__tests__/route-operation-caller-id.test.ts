import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { pgTable, text } from "drizzle-orm/pg-core";
import { basicFields } from "@/backend/schemas";

// ==============================================================================
// 「这次请求是谁发的」必须四个方法都拿得到
// ==============================================================================
// 自定义 handler 里最常要的一件事就是调用者是谁 —— 判权、署名、判「是不是本人」都靠它。
// 在此之前只有 POST（靠归属戳，而且换了归属列就不是 creatorId 了）和 PUT（editorId）真的把它
// 交出来，GET / DELETE 的 params 类型上**声明了** creatorId 却从来不填。那种错通不过任何
// 类型检查器：调用方写 `params.creatorId`，编译绿灯，运行时恒为 undefined —— 表现是端点对
// 所有人回 401（判权写成「拿不到就拒」时），或者更糟，判权条件恒假地放行。
//
// 所以四个方法统一交一个 `callerId`，这组用例钉住它。

type Operation = { _handler(req: any): Promise<any> };

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
    rpcOperation: () => ({ outputs: () => ({ handler: (fn: any) => fn }) }),
  };
});

vi.mock("next/server", () => ({
  NextRequest: class {},
  NextResponse: { json: (data: any) => data },
}));

const testTable = pgTable("items", { ...basicFields, name: text("name") });

function makeReq(body: any = {}, query: Record<string, string> = {}) {
  const url =
    "http://localhost/api/items?" + new URLSearchParams(query).toString();
  return { json: vi.fn(async () => body), url } as any;
}

const getSession = vi.fn(async () => ({ userId: "user-1" }));

describe("callerId —— 四个方法都交出调用者", () => {
  it("GET", async () => {
    const { createGetOperation } =
      await import("@/backend/route-operation/get-operation");
    const seen: any = {};
    const operation = createGetOperation({ getSession })({
      schemas: { query: z.object({}), response: z.object({}) },
      handler: async ({ params }) => {
        seen.params = params;
        return {};
      },
    });
    await (operation as unknown as Operation)._handler(makeReq());
    expect(seen.params.callerId).toBe("user-1");
  });

  it("GET list", async () => {
    const { createGetListOperation } =
      await import("@/backend/route-operation/get-list-operation");
    const seen: any = {};
    const operation = createGetListOperation({ getSession })({
      schemas: { query: z.object({}), response: z.object({}) },
      handler: async ({ params }) => {
        seen.params = params;
        return { data: [], total: 0 };
      },
    });
    await (operation as unknown as Operation)._handler(makeReq());
    expect(seen.params.callerId).toBe("user-1");
  });

  it("POST", async () => {
    const { createPostOperation } =
      await import("@/backend/route-operation/post-operation");
    const seen: any = {};
    const operation = createPostOperation({ getSession })({
      schemas: { body: z.object({ name: z.string() }) },
      handler: async ({ params }) => {
        seen.params = params;
        return {} as any;
      },
    });
    await (operation as unknown as Operation)._handler(
      makeReq({ name: "test" }),
    );
    expect(seen.params.callerId).toBe("user-1");
  });

  it("PUT", async () => {
    const { createPutOperation } =
      await import("@/backend/route-operation/put-operation");
    const seen: any = {};
    const operation = createPutOperation({ getSession })({
      schemas: { body: z.object({ id: z.string() }) },
      handler: async ({ params }) => {
        seen.params = params;
        return {} as any;
      },
    });
    await (operation as unknown as Operation)._handler(makeReq({ id: "id-1" }));
    expect(seen.params.callerId).toBe("user-1");
    // editorId 仍然在：它是写进行里的审计列，与「谁发的请求」是两个用途。
    expect(seen.params.editorId).toBe("user-1");
  });

  it("DELETE", async () => {
    const { createDeleteOperation } =
      await import("@/backend/route-operation/delete-operation");
    const seen: any = {};
    const operation = createDeleteOperation({ getSession })({
      schemas: { body: z.object({ id: z.string() }) },
      handler: async ({ params }) => {
        seen.params = params;
      },
    });
    await (operation as unknown as Operation)._handler(makeReq({ id: "id-1" }));
    expect(seen.params.callerId).toBe("user-1");
  });

  it("未登录时是 undefined，不是抛错 —— 判权由调用方自己写", async () => {
    const { createGetOperation } =
      await import("@/backend/route-operation/get-operation");
    const seen: any = {};
    const operation = createGetOperation({
      getSession: async () => undefined,
    })({
      schemas: { query: z.object({}), response: z.object({}) },
      access: { byCreator: false },
      handler: async ({ params }) => {
        seen.params = params;
        return {};
      },
    });
    await (operation as unknown as Operation)._handler(makeReq());
    expect(seen.params.callerId).toBeUndefined();
  });
});

// 这张表只是为了让 basicFields 有个落点，用例本身不碰库。
void testTable;
