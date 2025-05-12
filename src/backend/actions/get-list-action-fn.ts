import { ZodSchema } from "zod";
import { BaseTable, GetListRelations } from "@/backend/types";
import { rpcOperation } from "next-rest-framework";
import { listBodySchema } from "@/backend/schemas";
import { SelectedFields } from "drizzle-orm/pg-core/query-builders/select.types";
import { getListQuery } from "@/backend/actions/get-List-query";
import { getListData } from "@/backend/actions/get-list-data";
import { NodePgDatabase } from "drizzle-orm/node-postgres";

export function getListActionFn<
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
        body: listBodySchema(bodySchema),
        contentType: "application/json",
      },
    ])
    .handler(async (params) => {
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
    }) as any;
}
