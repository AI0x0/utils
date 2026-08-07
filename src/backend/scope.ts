import { Column, eq, inArray, SQL } from "drizzle-orm";
import { BaseTable } from "@/backend/types";

// ==============================================================================
// 行级作用域
// ==============================================================================
// `access.byCreator` 原本把两件事写死了：**哪一列**承载归属（creatorId）、**取什么值**
// （session.userId）。够用到出现「一条记录可能属于一个团队而不是一个人」为止 —— 那时归属列
// 是 ownerId，值是「当前站在哪个空间」，两个维度都得放开。这个文件就是放开后的那个概念。
//
// 三条设计约束，改这里之前先读：
//
// 1) **作用域不是普通筛选条件。** get-list-query 里的筛选是「空值就跳过」（`if (!value)
//    continue`），因为 `?name=` 这种空参数本来就该当没传。作用域走同一条路的话，一个取不到值
//    的作用域会让整条 where 消失 —— 列表返回全表。所以作用域**单独一条通道**传到查询构造器，
//    而且它没有「空值跳过」这一说：拿不到值就是错误，不是「不筛」。
//
// 2) **漏传和「明确不要」必须能区分。** 类型上作用域参数是必填的，不想要行级隔离就显式传
//    NO_SCOPE。写成可选参数的话，漏传就退化成不隔离，而那是静默的越权。
//
// 3) **列不存在要当场炸。** 配错列名（比如表上根本没有 ownerId）如果只是「查不到东西」，
//    症状是功能坏掉；但如果实现上退化成不加条件，症状就是越权。宁可抛。

/** 归属值：单个（等值匹配）或多个（IN）。 */
export type ScopeValue = string | string[];

/** 解析完的作用域：限定哪一列、限定成什么值。 */
export interface ScopeCondition {
  /** 承载归属的列名，如 "creatorId" / "ownerId"。 */
  column: string;
  value: ScopeValue;
}

/**
 * 明确表示「这条查询不做行级隔离」。
 *
 * 用一个可辨识的值而不是 undefined：调用方漏传参数时 TypeScript 会报错，而不是悄悄
 * 退化成「查全表」。凡是接受作用域的地方都必须收到 ScopeCondition 或 NO_SCOPE 之一。
 */
export const NO_SCOPE = null;

export type ScopeArg = ScopeCondition | typeof NO_SCOPE;

/** 空作用域值（undefined / 空串 / 空数组）—— 拿到它一律视为「解析失败」，不是「不筛」。 */
export function isEmptyScopeValue(
  value: ScopeValue | undefined,
): value is undefined {
  if (value === undefined) {
    return true;
  }
  return Array.isArray(value) ? value.length === 0 : value.trim() === "";
}

/**
 * 作用域 → drizzle 条件。NO_SCOPE 返回 undefined（调用方据此不加条件）。
 *
 * 列不在表上直接抛：这多半是配错了列名，而一个「配错了就不加条件」的实现等于把配置错误
 * 变成越权漏洞。
 */
export function scopeCondition(
  table: BaseTable,
  scope: ScopeArg,
): SQL | undefined {
  if (scope === NO_SCOPE) {
    return undefined;
  }
  const column = (table as unknown as Record<string, Column | undefined>)[
    scope.column
  ];
  if (!column) {
    throw new Error(
      `作用域列 "${scope.column}" 不在这张表上。检查 access.scope.column 是否写错，或这张表是否真的有归属列。`,
    );
  }
  if (isEmptyScopeValue(scope.value)) {
    throw new Error(
      `作用域列 "${scope.column}" 拿到的是空值。这不是「不筛」—— 上游应当在解析阶段就拒绝这个请求。`,
    );
  }
  return Array.isArray(scope.value)
    ? inArray(column, scope.value)
    : eq(column, scope.value);
}
