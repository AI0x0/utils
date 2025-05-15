import { z, ZodSchema } from "zod";
import { BaseTable, GetListRelations } from "@/backend/types";
import { SelectedFields } from "drizzle-orm/pg-core/query-builders/select.types";
import { getListQuery } from "@/backend/actions/get-list-query";
import { getListData } from "@/backend/actions/get-list-data";
import { NodePgDatabase } from "drizzle-orm/node-postgres";

export function getListActionFn<T extends ZodSchema, TTable extends BaseTable>({
  bodySchema,
  db,
  jsonArrayFields,
  relations,
  table,
}: {
  bodySchema: T;
  db: NodePgDatabase<any>;
  jsonArrayFields?: string[];
  relations?: GetListRelations;
  table: TTable;
}) {
  return async (params: Partial<z.infer<T>>) => {
    const { current, pageSize, ...other } = params;
    const fields: SelectedFields = {};
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    for (const key of Object.keys(bodySchema.shape)) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const field = table[key];
      if (field) {
        fields[key] = field;
      }
    }
    const { query, countQuery } = getListQuery({
      db,
      fields,
      jsonArrayFields,
      params: other,
      relations,
      table,
    });

    // 执行查询
    return getListData({
      bodySchema,
      countQuery,
      current,
      pageSize,
      query,
    })();
  };
}
