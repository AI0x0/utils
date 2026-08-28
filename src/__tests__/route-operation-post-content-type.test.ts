import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

type Operation = {
  _handler(req: any): Promise<any>;
  _input?: any;
};

vi.mock("@ai0x0/next-rest-framework", () => {
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
    url: "http://localhost/api/items",
  } as any;
}

function makeFormReq(entries: [string, string][]) {
  const formData = new FormData();
  entries.forEach(([key, value]) => formData.append(key, value));
  return {
    formData: vi.fn(async () => formData),
    json: vi.fn(async () => {
      throw new Error("should not read json");
    }),
    url: "http://localhost/api/items",
  } as any;
}

// ==============================================================================
// postOperation contentType
// ==============================================================================
describe("postOperation contentType", () => {
  const getSession = vi.fn(async () => ({ userId: "user-1" }));

  it("支持 multipart/form-data 并通过 formData 读取 body", async () => {
    const { createPostOperation } =
      await import("@/backend/route-operation/post-operation");
    const operation = createPostOperation({ getSession })({
      schemas: { body: z.object({ name: z.string() }) },
      contentType: "multipart/form-data",
    }) as unknown as Operation;

    const req = makeFormReq([["name", "upload"]]);
    const res = await operation._handler(req);

    expect(operation._input?.contentType).toBe("multipart/form-data");
    expect(req.formData).toHaveBeenCalled();
    expect(req.json).not.toHaveBeenCalled();
    expect(res.data).toEqual({ creatorId: "user-1", name: "upload" });
  });

  it("支持自定义 contentType 和 parseBody", async () => {
    const { createPostOperation } =
      await import("@/backend/route-operation/post-operation");
    const parseBody = vi.fn(async () => ({ name: "custom" }));
    const operation = createPostOperation({ getSession })({
      schemas: { body: z.object({ name: z.string() }) },
      contentType: "application/x.custom+json",
      parseBody,
    }) as unknown as Operation;

    const req = makeJsonReq({ name: "ignored" });
    const res = await operation._handler(req);

    expect(operation._input?.contentType).toBe("application/x.custom+json");
    expect(parseBody).toHaveBeenCalledWith(req);
    expect(req.json).not.toHaveBeenCalled();
    expect(res.data).toEqual({ creatorId: "user-1", name: "custom" });
  });

  it("handler 可以读取 req", async () => {
    const { createPostOperation } =
      await import("@/backend/route-operation/post-operation");
    const handler = vi.fn(async ({ data, req }: any) => ({
      ...data,
      url: req.url,
    }));
    const operation = createPostOperation({ getSession })({
      schemas: { body: z.object({ name: z.string() }) },
      handler,
    }) as unknown as Operation;

    const req = makeJsonReq({ name: "json" });
    const res = await operation._handler(req);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { creatorId: "user-1", name: "json" },
        params: { callerId: "user-1", creatorId: "user-1", name: "json" },
        req,
      }),
    );
    expect(res.data.url).toBe("http://localhost/api/items");
  });
});
