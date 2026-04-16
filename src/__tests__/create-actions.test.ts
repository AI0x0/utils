import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { pgTable, text } from "drizzle-orm/pg-core";
import { basicFields } from "@/backend/schemas";

const testTable = pgTable("items", {
  ...basicFields,
  name: text("name"),
});

// get-list-data 会在 getListQuery 返回的 query 上再调 .limit().offset().execute()
// 所以 chain 末端需要支持再次 limit → offset → execute
function makeQueryChain(rows: any[]) {
  const execute = vi.fn(async () => rows);
  const chain: any = {};
  chain.execute = execute;
  chain.offset = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.groupBy = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);
  return chain;
}

function makeDb(rows = [{ id: "id-1", name: "foo" }], count = "1") {
  const dataChain = makeQueryChain(rows);
  const countExecute = vi.fn(async () => [{ count }]);
  const countChain: any = {};
  countChain.execute = countExecute;
  countChain.where = vi.fn(() => countChain);
  countChain.leftJoin = vi.fn(() => countChain);
  countChain.from = vi.fn(() => countChain);

  const returning = vi.fn(async () => rows);
  const whereDelete = vi.fn(() => ({ returning }));
  const whereUpdate = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where: whereUpdate }));
  const values = vi.fn(() => ({ returning }));

  let selectCall = 0;
  const select = vi.fn(() => {
    selectCall++;
    // 第一次 select → 数据 query，第二次 → count query
    if (selectCall % 2 === 1) {
      return { from: vi.fn(() => dataChain) };
    } else {
      return { from: vi.fn(() => countChain) };
    }
  });

  return {
    select,
    insert: vi.fn(() => ({ values })),
    update: vi.fn(() => ({ set })),
    delete: vi.fn(() => ({ where: whereDelete })),
    _returning: returning,
    _values: values,
    _whereDelete: whereDelete,
  } as any;
}

// ───── createPostAction ─────
describe("createPostAction", () => {
  it("调用 db.insert 并返回结果", async () => {
    const { createPostAction } =
      await import("@/backend/actions/create-post-action");
    const db = makeDb();
    const action = createPostAction({
      bodySchema: z.object({ name: z.string() }),
      db,
      table: testTable,
    });
    const result = await action({ name: "bar" });
    expect(db.insert).toHaveBeenCalledWith(testTable);
    expect(result).toEqual([{ id: "id-1", name: "foo" }]);
  });

  it("转换 *At 字段为 Date", async () => {
    const { createPostAction } =
      await import("@/backend/actions/create-post-action");
    const db = makeDb();
    const action = createPostAction({
      bodySchema: z.object({ name: z.string(), publishedAt: z.string() }),
      db,
      table: testTable,
    });
    await action({ name: "x", publishedAt: "2024-01-01" });
    const valuesArg = db._values.mock.calls[0][0];
    expect(valuesArg.publishedAt).toBeInstanceOf(Date);
  });
});

// ───── createDeleteAction ─────
describe("createDeleteAction", () => {
  it("不带 creatorId 时直接删除", async () => {
    const { createDeleteAction } =
      await import("@/backend/actions/create-delete-action");
    const db = makeDb();
    const action = createDeleteAction({ table: testTable, db });
    const result = await action({ id: "id-1" });
    expect(db.delete).toHaveBeenCalledWith(testTable);
    expect(result).toEqual([{ id: "id-1", name: "foo" }]);
  });
});

// ───── createPutAction ─────
describe("createPutAction", () => {
  it("byCreator=false 时直接更新", async () => {
    const { createPutAction } =
      await import("@/backend/actions/create-put-action");
    const db = makeDb();
    const action = createPutAction({
      bodySchema: z.object({ id: z.string(), name: z.string() }),
      db,
      table: testTable,
    });
    const result = await action(
      { id: "id-1", name: "updated" },
      { byCreator: false },
    );
    expect(db.update).toHaveBeenCalledWith(testTable);
    expect(result).toEqual({ id: "id-1", name: "foo" });
  });

  it("byCreator=true 且 editorId 与 creatorId 匹配时更新成功", async () => {
    const { createPutAction } =
      await import("@/backend/actions/create-put-action");
    // 两次 select: 第一次验权查到记录，第二次是 update 后的 returning
    const db = makeDb([{ id: "id-1", name: "foo", creatorId: "user-1" }]);
    const action = createPutAction({
      bodySchema: z.object({ id: z.string(), name: z.string() }),
      db,
      table: testTable,
    });
    const result = await action(
      { id: "id-1", name: "updated", editorId: "user-1" },
      { byCreator: true },
    );
    expect(result).toBeDefined();
  });
});

// ───── createGetAction ─────
describe("createGetAction", () => {
  it("返回第一条记录", async () => {
    const { createGetAction } =
      await import("@/backend/actions/create-get-action");
    const db = makeDb([{ id: "id-1", name: "foo" }]);
    const bodySchema = z.object({ id: z.string(), name: z.string() });
    const action = createGetAction({ bodySchema, db, table: testTable });
    const result = await action({ id: "id-1" });
    expect(result).toEqual({ id: "id-1", name: "foo" });
  });

  it("查不到时返回 undefined", async () => {
    const { createGetAction } =
      await import("@/backend/actions/create-get-action");
    const db = makeDb([]);
    const bodySchema = z.object({ id: z.string(), name: z.string() });
    const action = createGetAction({ bodySchema, db, table: testTable });
    const result = await action({ id: "not-exist" });
    expect(result).toBeUndefined();
  });
});

// ───── createGetListAction ─────
describe("createGetListAction", () => {
  it("返回 data 和 total", async () => {
    const { createGetListAction } =
      await import("@/backend/actions/create-get-list-action");
    const db = makeDb([{ id: "id-1", name: "foo" }], "1");
    const bodySchema = z.object({ id: z.string(), name: z.string() });
    const action = createGetListAction({ bodySchema, db, table: testTable });
    const result = await action({});
    expect(result).toMatchObject({
      data: expect.any(Array),
      total: expect.any(Number),
    });
  });

  it("total 正确转为数字", async () => {
    const { createGetListAction } =
      await import("@/backend/actions/create-get-list-action");
    const db = makeDb([{ id: "id-1", name: "foo" }], "5");
    const bodySchema = z.object({ id: z.string(), name: z.string() });
    const action = createGetListAction({ bodySchema, db, table: testTable });
    const result = await action({});
    expect(result.total).toBe(5);
  });
});
