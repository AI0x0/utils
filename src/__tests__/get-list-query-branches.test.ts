import { describe, it, expect, vi } from "vitest";
import { pgTable, text } from "drizzle-orm/pg-core";
import { basicFields } from "@/backend/schemas";
import { getListQuery } from "@/backend/actions/get-list-query";

const table = pgTable("posts", {
  ...basicFields,
  title: text("title"),
  status: text("status"),
});

function makeDb() {
  const chain: any = {};
  chain.execute = vi.fn(async () => [{ count: "0" }]);
  chain.offset = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.groupBy = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.select = vi.fn(() => chain);
  return chain as any;
}

describe("getListQuery 分支覆盖", () => {
  it("字符串单值 id 字段使用 eq", () => {
    const db = makeDb();
    expect(() =>
      getListQuery({
        db,
        fields: { id: table.id },
        params: { id: "abc-123" },
        table,
      }),
    ).not.toThrow();
  });

  it("字符串单值非 id 字段使用 ilike", () => {
    const db = makeDb();
    expect(() =>
      getListQuery({
        db,
        fields: { title: table.title },
        params: { title: "hello" },
        table,
      }),
    ).not.toThrow();
  });

  it("逗号分隔 id 字段使用 inArray", () => {
    const db = makeDb();
    expect(() =>
      getListQuery({
        db,
        fields: { id: table.id },
        params: { id: "id-1,id-2" },
        table,
      }),
    ).not.toThrow();
  });

  it("逗号分隔非 id 字段使用 or+ilike", () => {
    const db = makeDb();
    expect(() =>
      getListQuery({
        db,
        fields: { title: table.title },
        params: { title: "foo,bar" },
        table,
      }),
    ).not.toThrow();
  });

  it("jsonArrayFields 单值使用 jsonb EXISTS", () => {
    const db = makeDb();
    expect(() =>
      getListQuery({
        db,
        fields: { status: table.status },
        params: { status: "active" },
        jsonArrayFields: ["status"],
        table,
      }),
    ).not.toThrow();
  });

  it("jsonArrayFields 逗号分隔使用 jsonb EXISTS 首值", () => {
    const db = makeDb();
    expect(() =>
      getListQuery({
        db,
        fields: { status: table.status },
        params: { status: "active,draft" },
        jsonArrayFields: ["status"],
        table,
      }),
    ).not.toThrow();
  });

  it("createdAtFrom 使用 gte", () => {
    const db = makeDb();
    expect(() =>
      getListQuery({
        db,
        fields: {},
        params: { createdAtFrom: "2024-01-01" },
        table,
      }),
    ).not.toThrow();
  });

  it("createdAtTo 使用 lte", () => {
    const db = makeDb();
    expect(() =>
      getListQuery({
        db,
        fields: {},
        params: { createdAtTo: "2024-12-31" },
        table,
      }),
    ).not.toThrow();
  });

  it("非字符串值使用 eq", () => {
    const db = makeDb();
    expect(() =>
      getListQuery({
        db,
        fields: { status: table.status },
        params: { status: 1 as any },
        table,
      }),
    ).not.toThrow();
  });

  it("orderDir=asc 使用 asc 排序", () => {
    const db = makeDb();
    expect(() =>
      getListQuery({
        db,
        fields: {},
        params: { orderBy: "createdAt", orderDir: "asc" },
        table,
      }),
    ).not.toThrow();
  });

  it("值为空时跳过条件", () => {
    const db = makeDb();
    expect(() =>
      getListQuery({ db, fields: {}, params: { title: "" }, table }),
    ).not.toThrow();
  });

  it("逗号分隔但 values 为空时跳过", () => {
    const db = makeDb();
    expect(() =>
      getListQuery({
        db,
        fields: { title: table.title },
        params: { title: " , " },
        table,
      }),
    ).not.toThrow();
  });
});
