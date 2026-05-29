import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { pgTable, text } from "drizzle-orm/pg-core";
import { basicFields } from "@/backend/schemas";

type Operation = {
  _options: any;
};

vi.mock("next-rest-framework", () => {
  const makeBuilder = (ctx: any = {}) => ({
    input: () => makeBuilder(ctx),
    outputs: () => makeBuilder(ctx),
    handler: (fn: any) => ({ _handler: fn, ...ctx }),
  });
  return {
    routeOperation: (options: any) => makeBuilder({ _options: options }),
    TypedNextResponse: {
      json: (data: any, init?: any) => ({ data, status: init?.status ?? 200 }),
    },
  };
});

vi.mock("next/server", () => ({
  NextRequest: class {},
}));

const testTable = pgTable("items", {
  ...basicFields,
  name: text("name"),
});

const mockDb = {} as unknown as NodePgDatabase<Record<string, unknown>>;

describe("route operation tags", () => {
  it("支持手动传 OpenAPI tags 和 description", async () => {
    const { createPostOperation } =
      await import("@/backend/route-operation/post-operation");
    const operation = createPostOperation({
      db: mockDb,
      getSession: async () => ({ userId: "user-1" }),
    })({
      bodySchema: z.object({ name: z.string() }),
      description: "Create an item with custom docs.",
      table: testTable,
      tags: ["manual", "custom"],
    }) as unknown as Operation;

    expect(operation._options.openApiOperation.description).toBe(
      "Create an item with custom docs.",
    );
    expect(operation._options.openApiOperation.tags).toEqual([
      "manual",
      "custom",
    ]);
  });
});
