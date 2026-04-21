import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { pgTable, text } from "drizzle-orm/pg-core";
import { basicFields } from "@/backend/schemas";

type Operation = { _handler: (req: any) => Promise<any> };

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
  const returning = vi.fn(async () => []);
  return {
    delete: vi.fn(() => ({ where: vi.fn(() => ({ returning })) })),
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
      byCreator: true,
    });
    const res = await (operation as unknown as Operation)._handler(
      makeReq({ id: "id-1" }),
    );
    expect(res.status).toBe(404);
    expect(res.data.message).toBe("未找到删除对象，或没有权限");
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("PUT 未找到对象或无权限时返回 404", async () => {
    const { createPutOperation } =
      await import("@/backend/route-operation/put-operation");
    const db = makeDb();
    const bodySchema = z.object({ id: z.string(), name: z.string() });
    const operation = createPutOperation({ db, getSession })({
      bodySchema,
      table: testTable,
      byCreator: true,
    });
    const res = await (operation as unknown as Operation)._handler(
      makeReq({ id: "id-1", name: "x" }),
    );
    expect(res.status).toBe(404);
    expect(res.data.message).toBe("未找到编辑对象，或没有权限");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("DELETE onError 优先于 HttpError 默认处理", async () => {
    const { createDeleteOperation } =
      await import("@/backend/route-operation/delete-operation");
    const db = makeDb();
    const onError = vi.fn(async () => ({
      data: { custom: true },
      status: 418,
    }));
    const operation = createDeleteOperation({ db, getSession })({
      table: testTable,
      byCreator: true,
      onError: onError as never,
    });
    const res = await (operation as unknown as Operation)._handler(
      makeReq({ id: "id-1" }),
    );
    expect(onError).toHaveBeenCalled();
    expect(res.status).toBe(418);
  });
});
