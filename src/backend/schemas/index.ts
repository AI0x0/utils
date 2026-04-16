import { z, ZodObject, ZodTypeAny } from "zod";
import {
  PgColumnBuilderBase,
  pgTable,
  PgTableExtraConfigValue,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { BuildExtraConfigColumns, Table } from "drizzle-orm";
import {
  BuildRefine,
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
  NoUnknownKeys,
} from "drizzle-zod";

//============================基本字段============================//
const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

const createdAt = () => timestamptz("created_at").notNull().defaultNow();
const updatedAt = () => timestamptz("updated_at").notNull().defaultNow();
const accessedAt = () => timestamptz("accessed_at").notNull().defaultNow();

export const basicFields = {
  id: uuid("id").defaultRandom().primaryKey(),
  creatorId: uuid("creator_id"),
  editorId: uuid("editor_id"),
  accessedAt: accessedAt(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
};

//============================列表查询字段============================//
export const queryListSchema = <Incoming extends ZodObject<any>>(
  schema: Incoming,
) =>
  z
    .object({
      current: z.string().optional().default("1"), // 默认页码为 1
      pageSize: z.string().optional().default("10"), // 默认每页条数为 10
      createdAtFrom: z.string().optional(), // 筛选开始日期
      createdAtTo: z.string().optional(), // 筛选结束日期
      orderBy: z.string().optional(),
      creatorId: z.string().optional(),
      orderDir: z.enum(["asc", "desc"]).optional(),
    })
    .merge(schema);

//============================列表返回字段============================//
export const listBodySchema = <T extends ZodTypeAny>(schema: T) =>
  z.object({
    total: z.number(),
    data: z.array(schema),
  });

//============================创建一个pg表============================//
export const createTableSchema = <
  TTableName extends string,
  TColumnsMap extends Record<string, PgColumnBuilderBase>,
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
      Record<string, PgColumnBuilderBase>,
      "pg"
    >,
  ) => PgTableExtraConfigValue[];
}) => {
  // 创建表
  const table = pgTable(
    name,
    {
      ...basicFields,
      ...columns,
    },
    extraConfig,
  );
  // 创建基础的schema
  const selectSchema = createSelectSchema(table as any, refineSchema) as any;
  // 去掉基础的字段的table
  const insertTable = pgTable(name, columns);
  const updateTable = pgTable(name, {
    id: uuid(),
    ...columns,
  });
  return {
    table,
    selectSchema,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    insertSchema: createInsertSchema(insertTable, refineSchema),
    updateSchema: createUpdateSchema(
      updateTable as any,
      {
        id: z.string(),
        ...refineSchema,
      } as any,
    ),
    querySchema: selectSchema.pick({ id: true }),
    queryListSchema: queryListSchema(selectSchema.partial()),
    queryListSelectSchema: selectSchema,
  };
};
