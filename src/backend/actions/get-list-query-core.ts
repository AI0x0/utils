// ==============================================================================
// 列表查询的公共实现（pg / sqlite 共用）
// ==============================================================================
// 从前 pg 与 sqlite 各有一份 270 行的 get-list-query，逐字相同的部分占八成 —— 筛选条件怎么拼、
// 日期范围怎么认、多值怎么拆、排序与分页怎么加、计数查询怎么建，两边一模一样。**真正的方言
// 差异只有两条原语**：
//
//   · 大小写不敏感的模糊匹配 —— pg 要 ilike，sqlite 的 like 本来就不区分大小写；
//   · 「JSON 数组列里有没有含这段文字的元素」—— pg 用 jsonb_array_elements_text，
//     sqlite 用 json_each（而且取值的字段名也不同：tag vs tag.value）。
//
// 所以这里收下一个 dialect 就够了，剩下的一份写完两边共用。与 route-operation 那边
// createXxxOperationFactory + 薄封装是同一个套路。
//
// 抄两份的代价不是抽象的：这个文件改过好几次（作用域先于筛选、空值跳过、日期范围），
// 每一次都得记得改另一棵树，而漏掉不会有任何东西报错 —— 只会让 sqlite 那边悄悄少一条规则。

import {
  and,
  asc,
  Column,
  desc,
  eq,
  gte,
  inArray,
  lte,
  or,
  sql,
  SQL,
} from "drizzle-orm";
import { ScopeArg, scopeCondition } from "@/backend/scope";

/**
 * 核心用得到表的哪一部分：只有 `id`（计数与分组要它）和「按列名取列」。
 * 两棵树的 BaseTable 都满足它，而 dialect 各自的 Table 类型不必进来。
 */
export interface ListQueryTable {
  id: Column;
}

export interface ListQueryRelation {
  groupBy?: boolean;
  select?: Record<string, unknown>;
  sql?: SQL;
  table?: ListQueryTable;
}

/** 两套方言之间**全部**的差异。加第三种数据库时要写的也只有这两条。 */
export interface ListQueryDialect {
  /** 大小写不敏感的「包含」。 */
  contains(_column: Column, _keyword: string): SQL;
  /** 「这个 JSON 数组列里有没有元素含这段文字」。 */
  jsonArrayContains(_column: Column, _keyword: string): SQL;
}

export interface ListQueryParams {
  [field: string]: unknown;
  orderBy?: string;
  orderDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

// 按列名从表（或它的关联表）里取列。**唯一一处按字符串索引的地方** —— 收在这儿，
// 免得每个用到的地方都写一次断言。取不到回 undefined，调用方据此跳过这个条件。
function columnAt(table: ListQueryTable, key: string): Column | undefined {
  return (table as unknown as Record<string, Column | undefined>)[key];
}

export function createGetListQuery(dialect: ListQueryDialect) {
  return function getListQuery<
    TTable extends ListQueryTable,
    TSelection extends Record<string, unknown>,
  >({
    db,
    fields,
    jsonArrayFields,
    params,
    relations,
    scope,
    table,
  }: {
    // 两套驱动的 db 类型没有公共父类型（NodePgDatabase / BetterSQLite3Database），
    // 而这里只用到 .select()。精确类型留在两个薄封装的签名上，调用方看到的仍然是准确的。
    db: any;
    fields: TSelection;
    jsonArrayFields?: string[];
    /**
     * 行级作用域。**必填**，不想隔离就显式传 NO_SCOPE —— 写成可选的话，漏传就退化成查全表，
     * 而那是静默的越权（见 scope.ts）。它不走下面 params 那条筛选通道，因为那条的规矩是
     * 「空值跳过」，一个取不到值的作用域会让整条 where 消失。
     */
    scope: ScopeArg;
    params: ListQueryParams;
    relations?: ListQueryRelation[];
    table: TTable;
  }) {
    const {
      page = 1,
      pageSize = 10,
      orderBy = "createdAt",
      orderDir = "desc",
      ...filters
    } = params;

    // ==========================================================================
    // 基础查询
    // ==========================================================================
    function buildBaseQuery() {
      let queryFields = { ...fields };
      if (relations?.length) {
        for (const { select } of relations) {
          queryFields = { ...queryFields, ...select };
        }
      }

      const query = db.select(queryFields).from(table);

      if (relations?.length) {
        query.groupBy(
          table.id,
          ...relations
            .filter(({ groupBy }) => groupBy)
            .filter(({ table: joined }) => joined)
            .map(({ table: joined }) => (joined as ListQueryTable).id),
        );
      }

      return query;
    }

    // 先在主表上找，找不到再去关联表上找。
    function findTargetColumn(key: string): Column | undefined {
      return [table as ListQueryTable]
        .concat(
          relations
            ?.filter(({ table: joined }) => joined)
            .map(({ table: joined }) => joined as ListQueryTable) || [],
        )
        .map((candidate) => columnAt(candidate, key))
        .find(Boolean);
    }

    // ==========================================================================
    // 单个筛选条件
    // ==========================================================================
    // 三条规矩，两套方言一致：
    //   · 名字里带 id 的按精确匹配（多值走 IN），其余按模糊；
    //   · 逗号分隔视为多值；
    //   · JSON 数组列走 dialect 那条 EXISTS。
    function addCondition(
      conditions: SQL[],
      key: string,
      value: unknown,
      targetColumn: Column,
    ) {
      const isIdField = /id/i.test(key);
      const isJsonArray = jsonArrayFields?.includes(key);

      if (typeof value !== "string") {
        conditions.push(eq(targetColumn, value));
        return;
      }

      if (value.includes(",")) {
        const values = value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
        if (!values.length) {
          return;
        }
        if (isJsonArray) {
          // 多值时只认第一个 —— 与从前逐字一致，不趁重构改行为。
          conditions.push(dialect.jsonArrayContains(targetColumn, values[0]));
        } else if (isIdField) {
          conditions.push(inArray(targetColumn, values));
        } else {
          conditions.push(
            or(
              ...values.map((item) => dialect.contains(targetColumn, item)),
            ) as SQL,
          );
        }
        return;
      }

      if (isJsonArray) {
        conditions.push(dialect.jsonArrayContains(targetColumn, value));
      } else if (isIdField) {
        conditions.push(eq(targetColumn, value));
      } else {
        conditions.push(dialect.contains(targetColumn, value));
      }
    }

    function buildConditions() {
      const conditions: SQL[] = [];
      for (const [key, value] of Object.entries(filters)) {
        // 空值跳过。**这条只对筛选成立**，作用域另走一条路（见下）。
        if (!value) {
          continue;
        }

        // 日期范围：xxxAtFrom / xxxAtTo 落到 xxxAt 那一列上。
        if (key.endsWith("AtFrom") || key.endsWith("AtTo")) {
          const baseFieldName = key.replace(/(AtFrom|AtTo)$/, "");
          const targetColumn = findTargetColumn(`${baseFieldName}At`);
          if (!targetColumn) {
            continue;
          }
          conditions.push(
            key.endsWith("AtFrom")
              ? gte(targetColumn, new Date(value as string))
              : lte(targetColumn, new Date(value as string)),
          );
          continue;
        }

        const targetColumn = findTargetColumn(key);
        if (!targetColumn) {
          continue;
        }
        addCondition(conditions, key, value, targetColumn);
      }
      return conditions;
    }

    function buildOrderBy() {
      const orderColumn = columnAt(table, orderBy) as Column;
      return orderDir === "asc" ? asc(orderColumn) : desc(orderColumn);
    }

    // ==========================================================================
    // 组装
    // ==========================================================================
    const baseQuery = buildBaseQuery();

    // **作用域先于筛选加进去**，且它不受 buildConditions 里「空值跳过」那条规矩管：
    // 那条规矩对 `?name=` 这种空参数是对的，对归属则是灾难性的 —— 条件消失即全表可见。
    const scopeSql = scopeCondition(table as never, scope);
    const conditions = scopeSql ? [scopeSql] : [];
    conditions.push(...buildConditions());

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const query = baseQuery
      .where(where)
      .orderBy(buildOrderBy())
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const countQuery = db
      .select({ count: sql`COUNT(DISTINCT ${table.id})` })
      .from(table)
      .where(where);

    if (relations?.length) {
      for (const { table: relationTable, sql: joinSql } of relations) {
        if (relationTable) {
          query.leftJoin(relationTable, joinSql);
          countQuery.leftJoin(relationTable, joinSql);
        }
      }
    }

    return { countQuery, query };
  };
}
