import { describe, expect, it } from "vitest";
import { text } from "drizzle-orm/sqlite-core";
import { z } from "zod";

import { createTableSchema, queryListSchema } from "@/backend/sqlite/schemas";

describe("sqlite createTableSchema", () => {
  const { table, selectSchema, insertSchema, updateSchema } = createTableSchema(
    {
      name: "sqlite_projects",
      columns: {
        name: text("name").notNull(),
        codexThreadId: text("codex_thread_id"),
      },
    },
  );

  it("adds shared base fields", () => {
    expect(table.id).toBeDefined();
    expect(table.creatorId).toBeDefined();
    expect(table.accessedAt).toBeDefined();
    expect(table.createdAt).toBeDefined();
    expect(table.updatedAt).toBeDefined();
  });

  it("validates select payloads with Date timestamp fields", () => {
    const now = new Date();
    const result = selectSchema.safeParse({
      id: "project-1",
      creatorId: null,
      editorId: null,
      accessedAt: now,
      createdAt: now,
      updatedAt: now,
      name: "demo",
      codexThreadId: null,
    });

    expect(result.success).toBe(true);
  });

  it("keeps insert and update schemas focused on business fields", () => {
    expect(insertSchema.safeParse({ name: "demo" }).success).toBe(true);
    expect(updateSchema.safeParse({ name: "demo" }).success).toBe(false);
    expect(
      updateSchema.safeParse({ id: "project-1", name: "demo" }).success,
    ).toBe(true);
  });
});

describe("sqlite queryListSchema", () => {
  it("preserves pagination defaults", () => {
    const schema = queryListSchema(z.object({ name: z.string().optional() }));
    const result = schema.parse({});

    expect(result.current).toBe("1");
    expect(result.pageSize).toBe("10");
  });
});
