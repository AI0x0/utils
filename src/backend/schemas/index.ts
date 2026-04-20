import { z, ZodObject, ZodType } from "zod";
import {
  SQLiteColumnBuilderBase,
  sqliteTable,
  SQLiteTableExtraConfigValue,
  text,
  integer,
} from "drizzle-orm/sqlite-core";
import { BuildExtraConfigColumns, Table } from "drizzle-orm";
import {
  BuildRefine,
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
  NoUnknownKeys,
} from "drizzle-zod";

//============================基本字段============================//
// SQLite / D1：用 text 存 ISO 时间戳，用 text 存 uuid（crypto.randomUUID()）
const timestamp = (name: string) =>
  text(name).$defaultFn(() => new Date().toISOString());

export const basicFields = {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  creatorId: text("creator_id"),
  editorId: text("editor_id"),
  accessedAt: timestamp("accessed_at").notNull(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
};

export { integer, text };

//============================列表查询字段============================//
export const queryListSchema = <Incoming extends ZodObject>(schema: Incoming) =>
  z
    .object({
      current: z.string().optional().default("1"),
      pageSize: z.string().optional().default("10"),
      createdAtFrom: z.string().optional(),
      createdAtTo: z.string().optional(),
      orderBy: z.string().optional(),
      creatorId: z.string().optional(),
      orderDir: z.enum(["asc", "desc"]).optional(),
    })
    .merge(schema);

//============================列表返回字段============================//
export const listBodySchema = <T extends ZodType>(schema: T) =>
  z.object({
    total: z.number(),
    data: z.array(schema),
  });

//============================创建一个 SQLite 表（D1）============================//
export const createTableSchema = <
  TTableName extends string,
  TColumnsMap extends Record<string, SQLiteColumnBuilderBase>,
  TTable extends Table,
  TRefine extends BuildRefine<TTable["_"]["columns"], undefined>,
>({
  name,
  columns,
  refineSchema,
  extraConfig,
}: {
  name: TTableName;
  columns: TColumnsMap;
  refineSchema?: NoUnknownKeys<TRefine, TTable["$inferSelect"]>;
  extraConfig?: (
    self: BuildExtraConfigColumns<
      string,
      Record<string, SQLiteColumnBuilderBase>,
      "sqlite"
    >,
  ) => SQLiteTableExtraConfigValue[];
}) => {
  const table = sqliteTable(
    name,
    {
      ...basicFields,
      ...columns,
    } as Record<string, SQLiteColumnBuilderBase>,
    extraConfig as never,
  );
  const selectSchema = createSelectSchema(
    table as unknown as Table,
    refineSchema as NoUnknownKeys<TRefine, Table["$inferSelect"]> | undefined,
  );
  const insertTable = sqliteTable(
    name,
    columns as Record<string, SQLiteColumnBuilderBase>,
  );
  const updateTable = sqliteTable(name, {
    id: text("id"),
    ...columns,
  } as Record<string, SQLiteColumnBuilderBase>);
  return {
    table,
    selectSchema,
    insertSchema: createInsertSchema(
      insertTable as unknown as Table,
      refineSchema as NoUnknownKeys<TRefine, Table["$inferInsert"]> | undefined,
    ),
    updateSchema: createUpdateSchema(
      updateTable as unknown as Table,
      {
        id: z.string(),
        ...(refineSchema as Record<string, unknown>),
      } as Parameters<typeof createUpdateSchema>[1],
    ),
    querySchema: selectSchema.pick({ id: true }),
    queryListSchema: queryListSchema(selectSchema.partial()),
    queryListSelectSchema: selectSchema,
  };
};
