// ==============================================================================
// 列表查询的公共实现（pg / sqlite 共用）
// ==============================================================================
// 从前 pg 与 sqlite 各有一份 270 行的 get-list-query，逐字相同的部分占八成 —— 筛选条件怎么拼、
// 日期范围怎么认、多值怎么拆、排序与分页怎么加、计数查询怎么建，两边一模一样。**真正的方言
// 差异只有两条原语**：
//
//   · 大小写不敏感的模糊匹配 —— pg 用 ilike，sqlite 的 like 本来就不区分大小写，但要自己带
//     ESCAPE（pg 的 LIKE 默认拿反斜杠当转义符，sqlite 不带 ESCAPE 子句就一个转义符都没有）；
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
  is,
  lte,
  or,
  sql,
  SQL,
} from "drizzle-orm";
import { HttpError } from "@/backend/errors";
import { ScopeArg, scopeCondition } from "@/backend/scope";
import { normalizePaging } from "./paging";

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
  /**
   * 大小写不敏感的「包含」。收到的 pattern 是**已经转义、已经带好 `%` 的完整模式串** ——
   * 转义收在核心里做（见 escapeLikePattern），免得加第三种方言时漏掉那一步：漏掉不会报错，
   * 只会让 `%` 重新变回通配符。
   */
  contains(_column: Column, _pattern: string): SQL;
  /** 「这个 JSON 数组列里有没有元素匹配这个模式」。pattern 同上，已转义。 */
  jsonArrayContains(_column: Column, _pattern: string): SQL;
}

export interface ListQueryParams {
  [field: string]: unknown;
  orderBy?: string;
  orderDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

/**
 * 把用户输入变成 LIKE 模式里的**字面量**。
 *
 * 不转义的话 `?name=%` 就是「匹配全部」、`?name=a_c` 里的下划线是「任意一个字符」—— 前者只是
 * 筛不准，后者配合「能按某一列筛」就是一个逐字符试探值的通道。反斜杠自己也要转，否则
 * `?name=\` 会把后面那个 `%` 吃掉。
 */
export function escapeLikePattern(keyword: string): string {
  return `%${keyword.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

// 按列名从表（或它的关联表）里取列。**唯一一处按字符串索引的地方** —— 收在这儿，
// 免得每个用到的地方都写一次断言。取不到回 undefined，调用方据此跳过这个条件。
//
// is(…, Column) 这层不是多余的：按字符串取属性会取到原型链上的东西（`?orderBy=constructor`
// 拿到的是 Object 构造函数），而它不会在这里报错，会一路流到 drizzle 里才炸 —— 症状是 500，
// 而正确的症状是「这不是一个列」。
function columnAt(table: ListQueryTable, key: string): Column | undefined {
  const value = (table as unknown as Record<string, unknown>)[key];
  return is(value, Column) ? value : undefined;
}

// 「这个键该精确匹配还是模糊匹配」。
//
// 从前是 `/id/i.test(key)` —— 「名字里带 id」，于是 width / hidden / video 这类列名也被当成 id
// 列。文档写的一直是「以 Id 结尾」，这里按文档来。
function isIdKey(key: string): boolean {
  return key === "id" || key.endsWith("Id");
}

// 模糊匹配只在**文本列**上成立。uuid / 数字 / 时间 / 枚举列上 ILIKE 不是「筛不出东西」，是
// 数据库层面的类型错误（PG：operator does not exist: uuid ~~* unknown），也就是一个 500。
// 所以这些列一律退回精确匹配 —— 这同时让上面那条 isIdKey 的收紧变得安全：一个不以 Id 结尾的
// uuid 列（比如 parent、owner）从「精确」掉到「模糊」也不会炸。
function isFuzzyMatchable(column: Column): boolean {
  return column.dataType === "string" && !/uuid|enum/i.test(column.columnType);
}

export function createGetListQuery(dialect: ListQueryDialect) {
  return function getListQuery<
    TTable extends ListQueryTable,
    TSelection extends Record<string, unknown>,
  >({
    db,
    fields,
    filterable,
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
    /**
     * 允许被当成筛选条件的键。**不传等于不限制**（直接调 getListQuery 的老调用方行为不变）。
     *
     * 为什么需要它：筛选是按列名在表上找列的，而那跟「这个端点返回哪些列」完全脱钩 —— 于是
     * 一个只返回 id / title 的列表，照样可以 `?secret=sk-a` 让数据库去 `ilike '%sk-a%'`，再从
     * 返回的 total 上把这一列逐字符读出来。列表工厂传进来的是响应 schema 的字段集，也就是
     * 「调用方本来就读得到的那些列」，筛选面与可见面因此对齐。
     */
    filterable?: readonly string[];
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
      page,
      pageSize: rawPageSize,
      orderBy,
      orderDir = "desc",
      ...filters
    } = params;
    const { current, pageSize } = normalizePaging({
      current: page,
      pageSize: rawPageSize,
    });
    const allowed = filterable ? new Set(filterable) : undefined;
    const isFilterable = (key: string) => !allowed || allowed.has(key);

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
    //   · 以 Id 结尾的键（以及非文本列）按精确匹配（多值走 IN），其余按模糊；
    //   · 逗号分隔视为多值；
    //   · JSON 数组列走 dialect 那条 EXISTS。
    function addCondition(
      conditions: SQL[],
      key: string,
      value: unknown,
      targetColumn: Column,
    ) {
      const isExact = isIdKey(key) || !isFuzzyMatchable(targetColumn);
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
          conditions.push(
            dialect.jsonArrayContains(
              targetColumn,
              escapeLikePattern(values[0]),
            ),
          );
        } else if (isExact) {
          conditions.push(inArray(targetColumn, values));
        } else {
          conditions.push(
            or(
              ...values.map((item) =>
                dialect.contains(targetColumn, escapeLikePattern(item)),
              ),
            ) as SQL,
          );
        }
        return;
      }

      if (isJsonArray) {
        conditions.push(
          dialect.jsonArrayContains(targetColumn, escapeLikePattern(value)),
        );
      } else if (isExact) {
        conditions.push(eq(targetColumn, value));
      } else {
        conditions.push(
          dialect.contains(targetColumn, escapeLikePattern(value)),
        );
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
          const baseFieldName = `${key.replace(/(AtFrom|AtTo)$/, "")}At`;
          // 准入按落到的**那一列**判，不按参数名 —— createdAtFrom 能不能用，取决于
          // createdAt 是不是一个调用方读得到的列。
          if (!isFilterable(baseFieldName)) {
            continue;
          }
          const targetColumn = findTargetColumn(baseFieldName);
          if (!targetColumn) {
            continue;
          }
          const at = new Date(value as string);
          // 认不出来的日期不能往下传：drizzle 序列化 Invalid Date 时抛 RangeError，
          // 那是一个 500，而这明明是请求写错了。
          if (Number.isNaN(at.getTime())) {
            throw new HttpError(
              400,
              `${key} 不是一个能识别的时间，请用 ISO 8601（如 2026-08-01T00:00:00Z）。`,
            );
          }
          conditions.push(
            key.endsWith("AtFrom")
              ? gte(targetColumn, at)
              : lte(targetColumn, at),
          );
          continue;
        }

        if (!isFilterable(key)) {
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
      // 请求里给了值、和「谁都没给于是走默认」是两件事，错误也就不是同一种：前者是请求写错
      // （400），后者是这张表上根本没有 createdAt，属于配置错（跟 scopeCondition 那边同一类，
      // 抛普通 Error）。从前两种都退化成 `order by  desc` —— 一句语法错误的 SQL，500。
      const requested =
        typeof orderBy === "string" && orderBy ? orderBy : undefined;
      const orderKey = requested ?? "createdAt";
      const orderColumn = columnAt(table, orderKey);
      if (!orderColumn) {
        if (requested) {
          throw new HttpError(400, `orderBy "${requested}" 不是这张表上的列。`);
        }
        throw new Error(
          `默认排序列 createdAt 不在这张表上。给这张表的列表查询显式传一个 orderBy。`,
        );
      }
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
      .offset((current - 1) * pageSize);

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
