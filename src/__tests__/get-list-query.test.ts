import { describe, it, expect, vi } from "vitest";
import { getListQuery } from "@/backend/actions/get-list-query";
import { pgTable, text } from "drizzle-orm/pg-core";
import { basicFields } from "@/backend/schemas";

// 创建测试用表（含 basicFields 所需字段）
const testTable = pgTable("test_items", {
  ...basicFields,
  title: text("title"),
  status: text("status"),
});

// 构造最小可用的 mock db
function makeMockDb() {
  const chain: any = {};

  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.offset = vi.fn(() => chain);
  chain.groupBy = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);
  chain.execute = vi.fn(async () => [{ count: "0" }]);

  return { db: chain as any, chain };
}

describe("getListQuery", () => {
  it("不传过滤条件时正常构建查询", () => {
    const { db, chain } = makeMockDb();
    const fields = { id: testTable.id, title: testTable.title };

    const { query, countQuery } = getListQuery({
      db,
      fields,
      params: {},
      table: testTable,
    });

    expect(chain.select).toHaveBeenCalled();
    expect(chain.from).toHaveBeenCalled();
    expect(query).toBeDefined();
    expect(countQuery).toBeDefined();
  });

  it("分页参数默认 page=1 pageSize=10", () => {
    const { db, chain } = makeMockDb();
    getListQuery({ db, fields: {}, params: {}, table: testTable });
    // offset = (page-1) * pageSize = 0
    expect(chain.offset).toHaveBeenCalledWith(0);
    expect(chain.limit).toHaveBeenCalledWith(10);
  });

  it("自定义分页参数", () => {
    const { db, chain } = makeMockDb();
    getListQuery({
      db,
      fields: {},
      params: { page: 3, pageSize: 20 },
      table: testTable,
    });
    expect(chain.offset).toHaveBeenCalledWith(40);
    expect(chain.limit).toHaveBeenCalledWith(20);
  });

  it("返回 query 和 countQuery", () => {
    const { db } = makeMockDb();
    const result = getListQuery({
      db,
      fields: {},
      params: {},
      table: testTable,
    });
    expect(result).toHaveProperty("query");
    expect(result).toHaveProperty("countQuery");
  });

  it("传入 orderBy / orderDir 不报错", () => {
    const { db } = makeMockDb();
    expect(() =>
      getListQuery({
        db,
        fields: {},
        params: { orderBy: "createdAt", orderDir: "asc" },
        table: testTable,
      }),
    ).not.toThrow();
  });
});
