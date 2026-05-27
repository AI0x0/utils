import { AnySQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import { SQL } from "drizzle-orm";

// 定义一个包含必要字段的接口
export interface BaseTable extends SQLiteTable {
  id: AnySQLiteColumn;
  creatorId: AnySQLiteColumn;
  editorId: AnySQLiteColumn;
  accessedAt: AnySQLiteColumn;
  createdAt: AnySQLiteColumn;
  updatedAt: AnySQLiteColumn;
}

export type GetListRelations = {
  groupBy?: boolean;
  select?: Record<string, unknown>;
  sql?: SQL;
  table?: BaseTable; // 添加要选择的字段
}[];
