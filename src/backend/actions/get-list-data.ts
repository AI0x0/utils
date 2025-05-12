import { ZodSchema } from "zod";
import { getListQuery } from "./get-List-query";
import { rpcOperation } from "next-rest-framework";
import { listBodySchema } from "../schemas";

export function getListData<B extends ZodSchema>({
  query,
  countQuery,
  pageSize = 10,
  current = 1,
  bodySchema,
}: {
  bodySchema: B;
  current?: number;
  pageSize?: number;
} & ReturnType<typeof getListQuery>) {
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
        .limit(+pageSize)
        .offset((+current - 1) * +pageSize)
        .execute();

      // 获取总记录数
      const [{ count }] = await countQuery.execute();

      return { data, total: Number(count) };
    }) as any;
}
