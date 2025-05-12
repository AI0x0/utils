import { ZodSchema } from "zod";
import { rpcOperation } from "next-rest-framework";
import { getListQuery } from "./get-list-query";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { SelectedFields } from "drizzle-orm/pg-core/query-builders/select.types";
import { getListData } from "./get-list-data";
import { BaseTable, GetListRelations } from "@/backend/types";

export function getActionFn<
  T extends ZodSchema,
  Q extends ZodSchema,
  TTable extends BaseTable,
>({
  bodySchema,
  db,
  jsonArrayFields,
  querySchema,
  relations,
  table,
}: {
  bodySchema: T;
  db: NodePgDatabase<any>;
  jsonArrayFields?: string[];
  querySchema: Q;
  relations?: GetListRelations;
  table: TTable;
}) {
  return rpcOperation()
    .input({
      body: querySchema,
      contentType: "application/json",
    })
    .outputs([
      {
        body: bodySchema,
        contentType: "application/json",
      },
    ])
    .handler(async (params) => {
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

      return result || {};
    }) as any;
}
