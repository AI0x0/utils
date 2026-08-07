import { describe, expect, it, vi } from "vitest";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { NO_SCOPE, scopeCondition } from "@/backend/scope";
import { resolveAccess } from "@/backend/route-operation/operation-common";

const testTable = pgTable("items", {
  id: uuid("id").primaryKey().defaultRandom(),
  creatorId: uuid("creator_id"),
  ownerId: uuid("owner_id"),
  editorId: uuid("editor_id"),
  accessedAt: timestamp("accessed_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  name: text("name"),
}) as never;

// ==============================================================================
// scopeCondition
// ==============================================================================

describe("scopeCondition", () => {
  it("NO_SCOPE 不产生条件", () => {
    expect(scopeCondition(testTable, NO_SCOPE)).toBeUndefined();
  });

  it("单值走等值、多值走 IN", () => {
    expect(
      scopeCondition(testTable, { column: "ownerId", value: "a" }),
    ).toBeDefined();
    expect(
      scopeCondition(testTable, { column: "ownerId", value: ["a", "b"] }),
    ).toBeDefined();
  });

  it("列不在表上直接抛 —— 配错列名不能退化成「不加条件」", () => {
    expect(() =>
      scopeCondition(testTable, { column: "nopeId", value: "a" }),
    ).toThrow(/不在这张表上/);
  });

  it("空值直接抛，而不是当成「不筛」", () => {
    expect(() =>
      scopeCondition(testTable, { column: "ownerId", value: "" }),
    ).toThrow(/空值/);
    expect(() =>
      scopeCondition(testTable, { column: "ownerId", value: [] }),
    ).toThrow(/空值/);
  });
});

// ==============================================================================
// resolveAccess —— 失败一律拒绝，绝不降级
// ==============================================================================

describe("resolveAccess", () => {
  it("默认（不配 access）按 creatorId 隔离", async () => {
    const { scope } = await resolveAccess({
      loadSession: async () => ({ userId: "user-1" }),
      method: "GET",
    });
    expect(scope).toEqual({ column: "creatorId", value: "user-1" });
  });

  it("没有会话时 401 —— 这是从前会「查全表」的那条路", async () => {
    await expect(
      resolveAccess({
        loadSession: async () => undefined,
        method: "GET",
      }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("会话在但作用域取不到值时 403，不退化成不隔离", async () => {
    await expect(
      resolveAccess({
        access: { scope: { column: "ownerId", value: () => undefined } },
        loadSession: async () => ({ userId: "user-1" }),
        method: "GET",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("自定义列与自定义取值", async () => {
    const { scope } = await resolveAccess({
      access: {
        scope: {
          column: "ownerId",
          value: (session: { ownerId: string } | undefined) => session?.ownerId,
        },
      },
      loadSession: async () => ({ ownerId: "team-9" }),
      method: "GET",
    });
    expect(scope).toEqual({ column: "ownerId", value: "team-9" });
  });

  it("byCreator:false 得到 NO_SCOPE，且不白查一次会话", async () => {
    const getSession = vi.fn(async () => ({ userId: "user-1" }));
    const { scope } = await resolveAccess({
      access: { byCreator: false },
      loadSession: getSession,
      method: "GET",
    });
    expect(scope).toBe(NO_SCOPE);
    expect(getSession).not.toHaveBeenCalled();
  });

  it("can 返回 false → 403；返回对象可自定状态码与文案", async () => {
    await expect(
      resolveAccess({
        access: { byCreator: false, can: () => false },
        loadSession: async () => ({ userId: "user-1" }),
        method: "PUT",
      }),
    ).rejects.toMatchObject({ status: 403 });

    await expect(
      resolveAccess({
        access: {
          byCreator: false,
          can: () => ({ message: "只读成员不能改", status: 405 }),
        },
        loadSession: async () => ({ userId: "user-1" }),
        method: "PUT",
      }),
    ).rejects.toMatchObject({ message: "只读成员不能改", status: 405 });
  });

  it("can 拿得到方法名，只读角色可以只拦写", async () => {
    const can = vi.fn(({ method }: { method: string }) => method === "GET");
    const ok = await resolveAccess({
      access: { byCreator: false, can },
      loadSession: async () => ({ userId: "user-1" }),
      method: "GET",
    });
    expect(ok.scope).toBe(NO_SCOPE);
    await expect(
      resolveAccess({
        access: { byCreator: false, can },
        loadSession: async () => ({ userId: "user-1" }),
        method: "DELETE",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

// ==============================================================================
// 回归：作用域不能被「空值跳过筛选」那条规矩吃掉
// ==============================================================================

describe("作用域不走筛选通道", () => {
  it("空的普通筛选照旧被跳过，但作用域条件仍在", async () => {
    const { getListQuery } = await import("@/backend/actions/get-list-query");
    const where = vi.fn((_condition?: unknown) => ({
      orderBy: () => ({ limit: () => ({ offset: () => ({}) }) }),
    }));
    const db = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where })) })),
    } as never;
    getListQuery({
      db,
      fields: {},
      // name 是空串 —— 普通筛选该跳过
      params: { name: "" },
      scope: { column: "ownerId", value: "team-9" },
      table: testTable,
    });
    // where 收到的不是 undefined：作用域那条还在
    expect(where).toHaveBeenCalled();
    expect(where.mock.calls[0][0]).toBeDefined();
  });
});
