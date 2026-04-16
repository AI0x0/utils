import { describe, it, expect } from "vitest";
import getTableName from "@/backend/route-operation/get-table-name";
import { pgTable, text, uuid } from "drizzle-orm/pg-core";

describe("getTableName", () => {
  it("返回正确的表名", () => {
    const usersTable = pgTable("users", {
      id: uuid("id").primaryKey(),
      name: text("name"),
    });
    expect(getTableName(usersTable)).toBe("users");
  });

  it("支持带下划线的表名", () => {
    const table = pgTable("user_profiles", { id: uuid("id").primaryKey() });
    expect(getTableName(table)).toBe("user_profiles");
  });

  it("不同表名互不干扰", () => {
    const t1 = pgTable("articles", { id: uuid("id").primaryKey() });
    const t2 = pgTable("comments", { id: uuid("id").primaryKey() });
    expect(getTableName(t1)).toBe("articles");
    expect(getTableName(t2)).toBe("comments");
  });
});
