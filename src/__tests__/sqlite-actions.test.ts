import { describe, expect, it, vi } from "vitest";
import { text } from "drizzle-orm/sqlite-core";
import { z } from "zod";

import { createGetListAction } from "@/backend/sqlite/actions";
import { createTableSchema } from "@/backend/sqlite/schemas";

const { table } = createTableSchema({
  name: "sqlite_action_items",
  columns: {
    name: text("name"),
  },
});

function makeQueryChain(rows: Array<Record<string, unknown>>) {
  const chain: any = {};
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.offset = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);
  chain.groupBy = vi.fn(() => chain);
  chain.all = vi.fn(() => rows);
  return chain;
}

function makeDb(rows = [{ id: "id-1", name: "demo" }], count = 1) {
  const dataChain = makeQueryChain(rows);
  const countChain = makeQueryChain([{ count }]);
  let selectCall = 0;

  return {
    select: vi.fn(() => {
      selectCall++;
      return {
        from: vi.fn(() => (selectCall % 2 === 1 ? dataChain : countChain)),
      };
    }),
    _dataChain: dataChain,
    _countChain: countChain,
  } as any;
}

describe("sqlite createGetListAction", () => {
  it("uses SQLite .all() queries and returns list data", async () => {
    const db = makeDb([{ id: "id-1", name: "demo" }], 1);
    const action = createGetListAction({
      bodySchema: z.object({ id: z.string(), name: z.string().nullable() }),
      db,
      table,
    });

    const result = await action({ current: 1, pageSize: 10, name: "demo" });

    expect(result).toEqual({
      data: [{ id: "id-1", name: "demo" }],
      total: 1,
    });
    expect(db._dataChain.all).toHaveBeenCalled();
    expect(db._countChain.all).toHaveBeenCalled();
  });
});
