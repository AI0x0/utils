import { BaseTable, GetListRelations } from "@/backend/types";
import { PgTable } from "drizzle-orm/pg-core";
import { SelectedFields } from "drizzle-orm/pg-core/query-builders/select.types";
import {
  and,
  asc,
  Column,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
  SQL,
} from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { ScopeArg, scopeCondition } from "@/backend/scope";

export function getListQuery<
  TTable extends BaseTable,
  TSelection extends SelectedFields,
>({
  db,
  fields,
  jsonArrayFields,
  params,
  relations,
  scope,
  table,
}: {
  db: NodePgDatabase<Record<string, unknown>>;
  fields: TSelection;
  jsonArrayFields?: string[];
  /**
   * 行级作用域。**必填**，不想隔离就显式传 NO_SCOPE —— 写成可选的话，漏传就退化成查全表，
   * 而那是静默的越权（见 scope.ts）。它不走下面 params 那条筛选通道，因为那条的规矩是
   * 「空值跳过」，一个取不到值的作用域会让整条 where 消失。
   */
  scope: ScopeArg;
  params: {
    // 排序方向
    [field: string]: unknown;
    // 每页条数
    orderBy?: keyof BaseTable;
    // ==============================================================================
    // Query Builder Functions
    // ==============================================================================
    // 排序字段
    orderDir?: "asc" | "desc";
    page?: number;
    // 页码
    pageSize?: number;
  };
  relations?: GetListRelations;
  table: TTable;
}) {
  const {
    page = 1,
    pageSize = 10,
    orderBy = "createdAt",
    orderDir = "desc",
    ...filters
  } = params;

  // 构建基础查询
  function buildBaseQuery<
    TTable extends BaseTable,
    TSelection extends SelectedFields,
  >(table: TTable, fields: TSelection, relations?: GetListRelations) {
    let queryFields = { ...fields };

    // 添加关联字段
    if (relations?.length) {
      for (const { select } of relations) {
        queryFields = { ...queryFields, ...select };
      }
    }

    const query = db.select(queryFields).from(table as unknown as PgTable);

    // 添加分组
    if (relations?.length) {
      query.groupBy(
        table.id,
        ...relations
          .filter(({ groupBy }) => groupBy)
          .filter(({ table }) => table)
          .map(({ table }) => (table as BaseTable).id),
      );
    }

    return query;
  }

  // 查找目标列
  function findTargetColumn(
    key: keyof BaseTable,
    table: BaseTable,
    relations?: GetListRelations,
  ) {
    return [table]
      .concat(
        relations
          ?.filter(({ table }) => table)
          .map(({ table }) => table as BaseTable) || [],
      )
      .find((table) => table[key])?.[key] as Column;
  }

  // 添加条件
  function addCondition(
    conditions: SQL[],
    key: string,
    value: unknown,
    targetColumn: Column,
  ) {
    const isIdField = /id/i.test(key);
    const isJsonArray = jsonArrayFields?.includes(key);

    if (typeof value === "string") {
      if (value.includes(",")) {
        // 处理多值
        const values = value
          .split(",")
          .map((val) => val.trim())
          .filter(Boolean);

        if (values.length > 0) {
          if (isJsonArray) {
            // 处理JSONB数组字段
            conditions.push(
              sql`
                EXISTS (
                  SELECT 1 FROM jsonb_array_elements_text(${targetColumn}) tag
                  WHERE tag LIKE ${`%${values[0]}%`}
                )
              `,
            );
          } else if (isIdField) {
            conditions.push(inArray(targetColumn, values));
          } else {
            conditions.push(
              or(
                ...values.map((val: string) => ilike(targetColumn, `%${val}%`)),
              ) as SQL,
            );
          }
        }
      } else {
        // 处理单值
        if (isJsonArray) {
          // 处理JSONB数组字段
          conditions.push(
            sql`
              EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(${targetColumn}) tag
                WHERE tag LIKE ${`%${value}%`}
              )
            `,
          );
        } else if (isIdField) {
          conditions.push(eq(targetColumn, value));
        } else {
          conditions.push(ilike(targetColumn, `%${value}%`));
        }
      }
    } else {
      conditions.push(eq(targetColumn, value));
    }
  }

  // 构建查询条件
  function buildConditions(
    filters: Record<string, unknown>,
    table: BaseTable,
    relations?: GetListRelations,
  ) {
    const conditions: SQL[] = [];

    // 处理过滤条件
    for (const [key, value] of Object.entries(filters)) {
      if (!value) {
        continue;
      }

      // 处理日期范围字段
      if (key.endsWith("AtFrom") || key.endsWith("AtTo")) {
        const baseFieldName = key.replace(/(AtFrom|AtTo)$/, "");
        const targetColumn = findTargetColumn(
          `${baseFieldName}At` as keyof BaseTable,
          table,
          relations,
        );

        if (!targetColumn) {
          continue;
        }

        if (key.endsWith("AtFrom")) {
          conditions.push(gte(targetColumn, new Date(value as string)));
        } else if (key.endsWith("AtTo")) {
          conditions.push(lte(targetColumn, new Date(value as string)));
        }
        continue;
      }

      // 处理其他普通过滤条件
      const targetColumn = findTargetColumn(
        key as keyof BaseTable,
        table,
        relations,
      );
      if (!targetColumn) {
        continue;
      }

      addCondition(conditions, key, value, targetColumn);
    }

    return conditions;
  }

  // 构建排序
  function buildOrderBy(
    table: BaseTable,
    orderBy: keyof BaseTable,
    orderDir: "asc" | "desc",
  ) {
    const orderColumn = table[orderBy] as Column;
    return orderDir === "asc" ? asc(orderColumn) : desc(orderColumn);
  }

  // 构建基础查询
  const baseQuery = buildBaseQuery(table, fields, relations);

  // 构建条件。**作用域先于筛选加进去**，且它不受 buildConditions 里「空值跳过」那条规矩管：
  // 那条规矩对 `?name=` 这种空参数是对的，对归属则是灾难性的 —— 条件消失即全表可见。
  const scopeSql = scopeCondition(table, scope);
  const conditions = scopeSql ? [scopeSql] : [];
  conditions.push(...buildConditions(filters, table, relations));

  // 构建主查询
  const query = baseQuery
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(buildOrderBy(table, orderBy, orderDir))

    // @ts-ignore
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  // 构建计数查询(优化后)
  const countQuery = db
    .select({ count: sql`COUNT(DISTINCT ${table.id})` })
    .from(table as unknown as PgTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  // 添加关联
  if (relations?.length) {
    for (const { table: relationTable, sql: joinSql } of relations) {
      if (relationTable) {
        query.leftJoin(relationTable, joinSql);
        countQuery.leftJoin(relationTable, joinSql);
      }
    }
  }

  // console.log(query.prepare("a").getQuery());

  return { countQuery, query };
}
