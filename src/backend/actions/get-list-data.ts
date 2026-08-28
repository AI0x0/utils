import { ZodSchema } from "zod";
import { getListQuery } from "./get-list-query";
import { rpcOperation } from "@ai0x0/next-rest-framework";
import { listBodySchema } from "../schemas";
import { normalizePaging } from "./paging";

export function getListData<B extends ZodSchema>({
  query,
  countQuery,
  pageSize: rawPageSize,
  current: rawCurrent,
  bodySchema,
}: {
  bodySchema: B;
  current?: number;
  pageSize?: number;
} & ReturnType<typeof getListQuery>) {
  // 这两个值到这儿还是 query 里来的字符串。归一化的三个理由见 paging.ts —— 最要紧的一条是
  // `+"abc"` 是 NaN，而 drizzle 遇到 falsy 的 limit 是**整条 LIMIT 不加**，一个笔误就是全量返回。
  const { current, pageSize } = normalizePaging({
    current: rawCurrent,
    pageSize: rawPageSize,
  });
  return rpcOperation()
    .outputs([
      {
        body: listBodySchema(bodySchema),
        contentType: "application/json",
      },
    ])
    .handler(async () => {
      // 执行查询
      const data = await query
        .limit(pageSize)
        .offset((current - 1) * pageSize)
        .execute();

      // 获取总记录数
      const [{ count }] = await countQuery.execute();

      return { data, total: Number(count) };
    });
}
