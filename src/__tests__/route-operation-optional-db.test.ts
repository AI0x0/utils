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

function makeReq(body: any = {}, query: Record<string, string> = {}) {
  const url =
    "http://localhost/api/items?" + new URLSearchParams(query).toString();
  return { json: vi.fn(async () => body), url } as any;
}

describe("route operation optional db", () => {
  const getSession = vi.fn(async () => ({ userId: "user-1" }));

  it("deleteOperation 不传 db 时跳过删除表操作", async () => {
    const { createDeleteOperation } =
      await import("@/backend/route-operation/delete-operation");
    const operation = createDeleteOperation({ getSession })({
      access: { byCreator: false },
      table: testTable,
    }) as unknown as Operation;

    const res = await operation._handler(makeReq({ id: "id-1" }));

    expect(res.data).toEqual({ id: "id-1" });
  });

  it("postOperation 不传 db 时跳过插入表操作", async () => {
    const { createPostOperation } =
      await import("@/backend/route-operation/post-operation");
    const operation = createPostOperation({ getSession })({
      schemas: { body: z.object({ name: z.string() }) },
      table: testTable,
    }) as unknown as Operation;

    const res = await operation._handler(makeReq({ name: "test" }));

    expect(res.data).toEqual({ creatorId: "user-1", name: "test" });
  });

  it("getListOperation 不传 db 时跳过列表表查询", async () => {
    const { createGetListOperation } =
      await import("@/backend/route-operation/get-list-operation");
    const operation = createGetListOperation({ getSession })({
      schemas: {
        query: z.object({}),
        response: z.object({ id: z.string(), name: z.string() }),
      },
      table: testTable,
    }) as unknown as Operation;

    const res = await operation._handler(makeReq());

    expect(res.data).toEqual({ data: [], total: 0 });
  });

  it("getOperation 不传 db 时跳过详情表查询", async () => {
    const { createGetOperation } =
      await import("@/backend/route-operation/get-operation");
    const operation = createGetOperation({ getSession })({
      access: { byCreator: false },
      schemas: {
        query: z.object({ id: z.string().optional() }),
        response: z.object({ id: z.string() }),
      },
      table: testTable,
    }) as unknown as Operation;

    const res = await operation._handler(makeReq({}, { id: "id-1" }));

    expect(res.data).toEqual({ id: "id-1" });
  });

  it("putOperation 不传 db 时跳过更新表操作", async () => {
    const { createPutOperation } =
      await import("@/backend/route-operation/put-operation");
    const operation = createPutOperation({ getSession })({
      access: { byCreator: false },
      schemas: { body: z.object({ id: z.string(), name: z.string() }) },
      table: testTable,
    }) as unknown as Operation;

    const res = await operation._handler(makeReq({ id: "id-1", name: "x" }));

    expect(res.data).toEqual({
      editorId: "user-1",
      id: "id-1",
      name: "x",
    });
  });
});
