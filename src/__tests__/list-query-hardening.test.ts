import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { route } from "next-rest-framework";
import { integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { sqliteTable, text as sqliteText } from "drizzle-orm/sqlite-core";
import { drizzle } from "drizzle-orm/pg-proxy";
import { drizzle as sqliteDrizzle } from "drizzle-orm/sqlite-proxy";
import { basicFields } from "@/backend/schemas";
import { queryListSchema } from "@/backend/schemas/common";
import { createGetListOperation } from "@/backend/route-operation/get-list-operation";
import { getListQuery as sqliteGetListQuery } from "@/backend/sqlite/actions/get-list-query";
import { NO_SCOPE } from "@/backend/scope";

// ==============================================================================
// 列表查询的几条边界
// ==============================================================================
// 这一组全部断言**真实生成的 SQL**（pg-proxy 驱动把 SQL 交出来），而不是「调用没抛异常」——
// 这里出过的问题恰恰都是「不抛、但 SQL 是错的」那一类：整条 LIMIT 消失、`order by  desc`、
// 该转义的 `%` 原样进了模式串。断言参数与语句本身才拦得住它们。

const table = pgTable("posts", {
  ...basicFields,
  title: text("title"),
  // 名字里带 "id" 但不以 Id 结尾 —— 从前的 /id/i 会把它当 id 列做精确匹配。
  hidden: text("hidden"),
  // 不在下面的响应 schema 里：一列「调用方读不到」的数据。
  secret: text("secret"),
  parentId: uuid("parent_id"),
  // uuid 列，但名字不以 Id 结尾：模糊匹配到它上面是数据库层面的类型错误。
  owner: uuid("owner"),
  rank: integer("rank"),
});

const responseSchema = z.object({
  id: z.string(),
  title: z.string(),
  hidden: z.string(),
  parentId: z.string(),
  owner: z.string(),
  rank: z.number(),
  createdAt: z.date(),
});

// catchall：任意 query 参数都能到达查询构造器 —— 正是筛选面收窄要防的那种入口。
const querySchema = queryListSchema(z.object({}).catchall(z.unknown()));

async function probe(search: string) {
  const seen: { sql: string; params: unknown[] }[] = [];
  const db = drizzle(async (sql, params) => {
    seen.push({ sql, params });
    return { rows: sql.includes("COUNT") ? [[0]] : [] };
  });
  const operation = createGetListOperation({
    db: db as never,
    getSession: vi.fn(async () => ({ userId: "user-1" })),
  })({
    schemas: { query: querySchema as never, response: responseSchema },
    table: table as never,
  });
  const handlers = route({
    listPosts: operation as never,
  }) as unknown as Record<
    string,
    (_req: Request, _ctx: unknown) => Promise<Response>
  >;
  const res = await handlers.GET(
    new Request(`http://localhost/api/posts${search}`),
    { params: Promise.resolve({}) },
  );
  return { data: seen[0], res, status: res.status };
}

describe("筛选面与可见面对齐", () => {
  it("响应 schema 里没有的列筛不了", async () => {
    const { data, status } = await probe("?secret=sk-abc");
    expect(status).toBe(200);
    expect(data.sql).not.toContain("secret");
    // 只剩作用域那一条
    expect(data.params).toEqual(["user-1", 10]);
  });

  it("响应 schema 里有的列照常筛", async () => {
    const { data } = await probe("?title=foo");
    expect(data.sql).toContain('"title" ilike');
    expect(data.params).toContain("%foo%");
  });

  it("落到读不到的列上的日期范围也筛不了", async () => {
    // accessedAt 是真列，但不在响应 schema 里
    const { data, status } = await probe("?accessedAtFrom=2024-01-01");
    expect(status).toBe(200);
    expect(data.sql).not.toContain("accessed_at");
  });
});

describe("LIKE 通配符按字面量处理", () => {
  it("% 与 _ 被转义", async () => {
    const { data } = await probe("?title=%25a_b");
    expect(data.params).toContain("%\\%a\\_b%");
  });

  it("反斜杠自己也被转义", async () => {
    const { data } = await probe("?title=%5C");
    expect(data.params).toContain("%\\\\%");
  });
});

describe("精确 / 模糊的分界", () => {
  it("以 Id 结尾走精确匹配", async () => {
    const { data } = await probe("?parentId=abc");
    expect(data.sql).toContain('"parent_id" = ');
    expect(data.params).toContain("abc");
  });

  it("名字里带 id 但不以 Id 结尾的文本列走模糊匹配", async () => {
    const { data } = await probe("?hidden=abc");
    expect(data.sql).toContain('"hidden" ilike');
  });

  it("非文本列一律精确匹配 —— uuid 上做 ilike 是类型错误", async () => {
    const { data } = await probe("?owner=abc");
    expect(data.sql).toContain('"owner" = ');
    expect(data.sql).not.toContain("ilike");
  });

  it("数字列同理", async () => {
    const { data } = await probe("?rank=3");
    expect(data.sql).toContain('"rank" = ');
    expect(data.sql).not.toContain("ilike");
  });
});

describe("orderBy", () => {
  it("不是这张表上的列 → 400，而不是一句语法错误的 SQL", async () => {
    const { status, res } = await probe("?orderBy=nope");
    expect(status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      message: expect.stringContaining("orderBy"),
    });
  });

  it("原型链上的属性不算列", async () => {
    const { status } = await probe("?orderBy=constructor");
    expect(status).toBe(400);
  });

  it("合法列照常排序", async () => {
    const { data } = await probe("?orderBy=title&orderDir=asc");
    expect(data.sql).toContain('order by "posts"."title" asc');
  });

  it("不传时按 createdAt 倒序", async () => {
    const { data } = await probe("");
    expect(data.sql).toContain('order by "posts"."created_at" desc');
  });
});

describe("分页", () => {
  it("pageSize 不是数字时回落默认值 —— 不能变成「没有 LIMIT」", async () => {
    const { data } = await probe("?pageSize=abc");
    expect(data.sql).toContain("limit");
    expect(data.params).toContain(10);
  });

  it("pageSize 截断到上界", async () => {
    const { data } = await probe("?pageSize=99999999");
    expect(data.params).toContain(10000);
  });

  it("pageSize 在上界内原样生效", async () => {
    const { data } = await probe("?pageSize=5000");
    expect(data.params).toContain(5000);
  });

  it("current=0 不会变成负数 offset", async () => {
    const { data } = await probe("?current=0");
    expect(data.params).not.toContain(-10);
  });

  it("正常翻页照旧", async () => {
    const { data } = await probe("?current=3&pageSize=20");
    expect(data.params).toEqual(["user-1", 20, 40]);
  });
});

describe("日期范围", () => {
  it("认不出来的时间 → 400，而不是序列化时的 RangeError", async () => {
    const { status, res } = await probe("?createdAtFrom=zzz");
    expect(status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      message: expect.stringContaining("createdAtFrom"),
    });
  });

  it("合法时间照常生成 >=", async () => {
    const { data } = await probe("?createdAtFrom=2024-01-01T00:00:00Z");
    expect(data.sql).toContain('"created_at" >=');
  });
});

describe("sqlite 方言", () => {
  const sqliteTableDef = sqliteTable("posts", {
    id: sqliteText("id").primaryKey(),
    title: sqliteText("title"),
    createdAt: sqliteText("created_at"),
  });

  it("LIKE 自带 ESCAPE —— 没有它，转义等于没做", () => {
    const { query } = sqliteGetListQuery({
      db: sqliteDrizzle(async () => ({ rows: [] })) as never,
      fields: { id: sqliteTableDef.id },
      params: { title: "a%b" },
      scope: NO_SCOPE,
      table: sqliteTableDef as never,
    });
    const { sql, params } = (
      query as unknown as { toSQL(): { sql: string; params: unknown[] } }
    ).toSQL();
    expect(sql).toContain("ESCAPE");
    expect(params).toContain("%a\\%b%");
  });
});
