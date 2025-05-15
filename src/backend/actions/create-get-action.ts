import { z, ZodSchema } from "zod";
import { getListQuery } from "./get-list-query";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { SelectedFields } from "drizzle-orm/pg-core/query-builders/select.types";
import { getListData } from "./get-list-data";
import { BaseTable, GetListRelations } from "@/backend/types";

export function createGetAction<T extends ZodSchema, TTable extends BaseTable>({
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
      params,
      relations,
      table,
    });

    // 执行查询
    const {
      data: [result],
    } = await getListData({
      bodySchema,
      countQuery,
      current: 1,
      pageSize: 1,
      query,
    })();

    return result;
  };
}
