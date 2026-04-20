import { z, ZodSchema } from "zod";
import { getListQuery } from "./get-list-query";
import { SelectedFields } from "drizzle-orm/sqlite-core/query-builders/select.types";
import { getListData } from "./get-list-data";
import { BaseTable, GetListRelations, AnyDatabase } from "@/backend/types";

export function createGetAction<T extends ZodSchema, TTable extends BaseTable>({
  bodySchema,
  db,
  jsonArrayFields,
  relations,
  table,
}: {
  bodySchema: T;
  db: AnyDatabase;
  jsonArrayFields?: string[];
  relations?: GetListRelations;
  table: TTable;
}) {
  return async (params: Partial<z.infer<T>> & Record<string, unknown>) => {
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

    const {
      data: [result],
    } = await getListData({
      bodySchema,
      countQuery,
      current: 1,
      pageSize: 1,
      query,
    })();

    return result as z.infer<T> | undefined;
  };
}
