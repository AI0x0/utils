import { z, ZodSchema } from "zod";
import { BaseTable, GetListRelations, AnyDatabase } from "@/backend/types";
import { SelectedFields } from "drizzle-orm/sqlite-core/query-builders/select.types";
import { getListQuery } from "@/backend/actions/get-list-query";
import { getListData } from "@/backend/actions/get-list-data";
export function createGetListAction<
  T extends ZodSchema,
  TTable extends BaseTable,
>({
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
    const { current, pageSize, ...other } = params as Record<
      string,
      unknown
    > & { current?: number; pageSize?: number };
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

    return getListData({
      bodySchema,
      countQuery,
      current,
      pageSize,
      query,
    })();
  };
}
