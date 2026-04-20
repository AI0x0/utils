import { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import { SQL } from "drizzle-orm";

/**
 * 对底层 drizzle 数据库实例做最宽松的约束：
 * 只要能 `select / insert / update / delete` 并支持 drizzle 语法即可，
 * 从而允许在不同 driver（如 drizzle-orm/d1）之间切换。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDatabase = any;

// 定义一个包含必要字段的接口（SQLite / D1）
export interface BaseTable extends SQLiteTable {
  id: SQLiteColumn;
  creatorId: SQLiteColumn;
  editorId: SQLiteColumn;
  accessedAt: SQLiteColumn;
  createdAt: SQLiteColumn;
  updatedAt: SQLiteColumn;
}

export type GetListRelations = {
  groupBy?: boolean;
  select?: Record<string, unknown>;
  sql?: SQL;
  table?: BaseTable;
}[];
