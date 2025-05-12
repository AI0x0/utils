import { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { SQL } from "drizzle-orm";

// 定义一个包含必要字段的接口
export interface BaseTable extends PgTable {
  createdAt: PgColumn;
  id: PgColumn;
}

export type GetListRelations = {
  groupBy?: boolean;
  select?: Record<string, unknown>;
  sql?: SQL;
  table?: BaseTable; // 添加要选择的字段
}[];
