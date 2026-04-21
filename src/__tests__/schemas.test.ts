import { describe, it, expect } from "vitest";
import {
  queryListSchema,
  listBodySchema,
  createTableSchema,
  createInsertBodySchema,
  createUpdateBodySchema,
  basicFields,
} from "@/backend/schemas";
import { z } from "zod";
import { pgTable, text, integer } from "drizzle-orm/pg-core";

describe("queryListSchema", () => {
  const base = z.object({ name: z.string().optional() });
  const schema = queryListSchema(base);

  it('默认 current 为 "1"', () => {
    const result = schema.parse({});
    expect(result.current).toBe("1");
  });

  it('默认 pageSize 为 "10"', () => {
    const result = schema.parse({});
    expect(result.pageSize).toBe("10");
  });

  it("接受自定义业务字段", () => {
    const result = schema.parse({
      name: "alice",
      current: "2",
      pageSize: "20",
    });
    expect(result.name).toBe("alice");
    expect(result.current).toBe("2");
    expect(result.pageSize).toBe("20");
  });

  it("orderDir 只接受 asc / desc", () => {
    expect(schema.safeParse({ orderDir: "asc" }).success).toBe(true);
    expect(schema.safeParse({ orderDir: "desc" }).success).toBe(true);
    expect(schema.safeParse({ orderDir: "invalid" }).success).toBe(false);
  });

  it("日期范围字段为可选", () => {
    const result = schema.parse({
      createdAtFrom: "2024-01-01",
      createdAtTo: "2024-12-31",
    });
    expect(result.createdAtFrom).toBe("2024-01-01");
    expect(result.createdAtTo).toBe("2024-12-31");
  });
});

describe("listBodySchema", () => {
  const itemSchema = z.object({ id: z.string(), title: z.string() });
  const schema = listBodySchema(itemSchema);

  it("验证合法数据", () => {
    const result = schema.safeParse({
      total: 2,
      data: [
        { id: "1", title: "a" },
        { id: "2", title: "b" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("total 必须为数字", () => {
    expect(schema.safeParse({ total: "bad", data: [] }).success).toBe(false);
  });

  it("data 必须为数组", () => {
    expect(schema.safeParse({ total: 0, data: null }).success).toBe(false);
  });

  it("空列表合法", () => {
    expect(schema.safeParse({ total: 0, data: [] }).success).toBe(true);
  });
});

describe("createTableSchema", () => {
  const {
    table,
    selectSchema,
    insertSchema,
    updateSchema,
    queryListSchema: qls,
  } = createTableSchema({
    name: "posts",
    columns: {
      title: text("title").notNull(),
      views: integer("views").default(0),
    },
  });

  it("table 包含基础字段", () => {
    expect(table.id).toBeDefined();
    expect(table.createdAt).toBeDefined();
    expect(table.updatedAt).toBeDefined();
  });

  it("selectSchema 验证合法数据", () => {
    const now = new Date();
    const result = selectSchema.safeParse({
      id: "a1b2c3d4-e5f6-4a7b-8c9d-000000000001",
      creatorId: null,
      editorId: null,
      title: "Hello",
      views: 0,
      accessedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    expect(result.success).toBe(true);
  });

  it("insertSchema 不含 id / createdAt 等基础字段", () => {
    const result = insertSchema.safeParse({ title: "New Post" });
    expect(result.success).toBe(true);
  });

  it("updateSchema 要求 id", () => {
    expect(updateSchema.safeParse({ title: "Updated" }).success).toBe(false);
    expect(
      updateSchema.safeParse({ id: "some-id", title: "Updated" }).success,
    ).toBe(true);
  });

  it("queryListSchema 包含分页字段", () => {
    const result = qls.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.current).toBe("1");
      expect(result.data.pageSize).toBe("10");
    }
  });
});

describe("createInsertBodySchema / createUpdateBodySchema", () => {
  const agents = pgTable("agents", {
    ...basicFields,
    name: text("name").notNull(),
    views: integer("views"),
  });

  it("insert 排除所有基础字段", () => {
    const schema = createInsertBodySchema(agents);
    expect(Object.keys(schema.shape).sort()).toEqual(["name", "views"]);
  });

  it("update 保留 id 且排除其他基础字段", () => {
    const schema = createUpdateBodySchema(agents);
    expect(Object.keys(schema.shape).sort()).toEqual(["id", "name", "views"]);
  });

  it("update 时 id 必填", () => {
    const schema = createUpdateBodySchema(agents);
    expect(schema.safeParse({ name: "x" }).success).toBe(false);
    const ok = schema.safeParse({
      id: "a1b2c3d4-e5f6-4a7b-8c9d-000000000001",
      name: "x",
    });
    expect(ok.success).toBe(true);
  });
});
