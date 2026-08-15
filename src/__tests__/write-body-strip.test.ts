import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { route } from "next-rest-framework";
import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { basicFields } from "@/backend/schemas";
import { createPostOperation } from "@/backend/route-operation/post-operation";
import { createPutOperation } from "@/backend/route-operation/put-operation";

// ==============================================================================
// 服务端自己的列，客户端写不进来
// ==============================================================================
// 「哪些列客户端能写」这条边界目前**不在本仓库里**：createPostAction 是
// `db.insert(table).values(body)`，中间没有第二道 schema 过滤，而 drizzle 会老实写下每一个是真
// 列的键（不是列的键它直接忽略）。真正做过滤的是 next-rest-framework 的 `.input({ body })` ——
// 它把 handler 收到的那个 clone 的 .json() 换成了 zod 校验后的结果，于是 schema 里没有的键在到
// 达这里之前就没了。
//
// 那是一个**按 git 分支钉住的依赖**的行为，本仓库改不了、升级时也不会有任何东西提醒。所以这组
// 用例钉的不是自己的代码，是那条假设：serverColumns / basicFields 不进 insert-update schema，
// 因此也不该进库。它红了，意味着「列写在哪个桶里就决定了能不能被客户端写」这条承诺失效 ——
// 那时要做的是在 createPostAction / createPutActionCore 里补一道按 schema 挑键，而不是改这里。
//
// 归属列（access.scope 那一列）另有一层保护，不依赖这条：见 route-operation-scope-stamp。

const table = pgTable("posts", {
  ...basicFields,
  // 假装是 createTableSchema 的 serverColumns：由服务端盖，绝不收客户端传的。
  tenantId: uuid("tenant_id"),
  title: text("title"),
});

function fakeDb() {
  const written: Record<string, unknown>[] = [];
  const returning = (values: Record<string, unknown>) => ({
    returning: async () => {
      written.push(values);
      return [values];
    },
  });
  return {
    written,
    insert: () => ({ values: returning }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => returning(values),
      }),
    }),
  };
}

async function call(
  handlers: unknown,
  method: "POST" | "PUT",
  body: string | FormData,
  headers: Record<string, string>,
) {
  const table_ = handlers as Record<
    string,
    (_req: Request, _ctx: unknown) => Promise<Response>
  >;
  return table_[method](
    new Request("http://localhost/api/posts", { body, headers, method }),
    { params: Promise.resolve({}) },
  );
}

describe("POST", () => {
  const db = fakeDb();
  const handlers = route({
    createPost: createPostOperation({
      db: db as never,
      getSession: vi.fn(async () => ({ userId: "user-1" })),
    })({
      schemas: { body: z.object({ title: z.string() }) },
      table,
    }) as never,
  });

  it("请求体里的 serverColumns / basicFields 到不了库里", async () => {
    const res = await call(
      handlers,
      "POST",
      JSON.stringify({
        title: "hi",
        tenantId: "11111111-1111-1111-1111-111111111111",
        editorId: "22222222-2222-2222-2222-222222222222",
        id: "33333333-3333-3333-3333-333333333333",
        createdAt: "1999-01-01T00:00:00Z",
      }),
      { "content-type": "application/json" },
    );

    expect(res.status).toBe(200);
    // 写进去的只有 schema 里那一列，外加服务端盖的归属
    expect(db.written).toEqual([{ creatorId: "user-1", title: "hi" }]);
  });
});

describe("POST（multipart/form-data）", () => {
  const db = fakeDb();
  // 表单那条路上 schema 收到的是 FormData 本身，所以得先转成对象再校验 —— 线上用的是
  // zod-form-data 的 zfd.formData()，这里手写等价的一层，免得为一个用例加依赖。
  const formBodySchema = z.preprocess(
    (value) => (value instanceof FormData ? Object.fromEntries(value) : value),
    z.object({ title: z.string() }),
  );
  const handlers = route({
    createPost: createPostOperation({
      db: db as never,
      getSession: vi.fn(async () => ({ userId: "user-1" })),
    })({
      contentType: "multipart/form-data",
      schemas: { body: formBodySchema },
      table,
    }) as never,
  });

  it("表单字段同样只留 schema 里的那些", async () => {
    const form = new FormData();
    form.append("title", "hi");
    form.append("tenantId", "11111111-1111-1111-1111-111111111111");

    const res = await call(handlers, "POST", form, {});

    expect(res.status).toBe(200);
    expect(db.written).toEqual([{ creatorId: "user-1", title: "hi" }]);
  });
});

describe("PUT", () => {
  const db = fakeDb();
  const handlers = route({
    updatePost: createPutOperation({
      db: db as never,
      getSession: vi.fn(async () => ({ userId: "user-1" })),
    })({
      schemas: { body: z.object({ id: z.string(), title: z.string() }) },
      table,
    }) as never,
  });

  it("请求体改不了归属、租户与审计列", async () => {
    const res = await call(
      handlers,
      "PUT",
      JSON.stringify({
        id: "row-1",
        title: "hi",
        creatorId: "44444444-4444-4444-4444-444444444444",
        tenantId: "11111111-1111-1111-1111-111111111111",
        editorId: "55555555-5555-5555-5555-555555555555",
      }),
      { "content-type": "application/json" },
    );

    expect(res.status).toBe(200);
    // editorId 是服务端盖的那一份（当前用户），不是请求体里那个
    expect(db.written).toEqual([
      { editorId: "user-1", id: "row-1", title: "hi" },
    ]);
  });
});
