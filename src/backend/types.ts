import { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { SQL } from "drizzle-orm";

/**
 * 对底层 drizzle 数据库实例做最宽松的约束：
 * 只要能 `select / insert / update / delete` 并支持 drizzle 语法即可，
 * 从而允许在不同 driver（node-postgres / postgres-js / neon-http 等）之间切换。
 *
 * 如需更强约束，调用方可以自行把具体 driver 的 db 类型 as 给这里，
 * 例如 `db as unknown as AnyDatabase`。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDatabase = any;

// 定义一个包含必要字段的接口
export interface BaseTable extends PgTable {
  id: PgColumn;
  creatorId: PgColumn;
  editorId: PgColumn;
  accessedAt: PgColumn;
  createdAt: PgColumn;
  updatedAt: PgColumn;
}

export type GetListRelations = {
  groupBy?: boolean;
  select?: Record<string, unknown>;
  sql?: SQL;
  table?: BaseTable; // 添加要选择的字段
}[];
