// ==============================================================================
// 分页参数归一化（pg / sqlite 共用）
// ==============================================================================
// query 参数在线上只有字符串，而这两个值最后是直接进 `.limit()` / `.offset()` 的。不归一化的
// 后果不是「筛不准」，是三种更难看的症状：
//
//   · `?pageSize=abc` → `+"abc"` 是 NaN，而 drizzle 对 falsy 的 limit 是**整条 LIMIT 不加** ——
//     一个笔误就是全量返回。这是这个文件存在的首要理由。
//   · `?current=0` → OFFSET 变成负数，数据库直接报错，一个 500。
//   · `?pageSize=99999999` → 真的去拉这么多行。
//
// 上界是**截断**而不是报错：列表的 describe 一直在教调用方「要整批就把 pageSize 调大」，
// 那些调用方传的是 5000 这种量级的真实值，为了一个上界让它们 400 不值当。截断之后 total 照常
// 是真实总数，调用方分得清自己有没有拿全。

/** pageSize 的硬上界。取这个量级是因为「一次把一整块数据取回来」是列表的正常用法。 */
export const MAX_PAGE_SIZE = 10000;

export const DEFAULT_PAGE_SIZE = 10;

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback;
}

/** 返回一定能安全喂给 limit / offset 的一对整数。 */
export function normalizePaging({
  current,
  pageSize,
}: {
  current?: unknown;
  pageSize?: unknown;
}): { current: number; pageSize: number } {
  return {
    current: toPositiveInt(current, 1),
    pageSize: Math.min(
      toPositiveInt(pageSize, DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    ),
  };
}
