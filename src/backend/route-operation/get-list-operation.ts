import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { NextRequest } from "next/server";
import { ZodSchema } from "zod";
import { createGetListAction } from "../actions/create-get-list-action";
import { BaseTable, GetListRelations } from "../types";
import getTableName from "./get-table-name";
import {
  createGetListOperationFactory,
  type GetListOperationOptions as CoreGetListOperationOptions,
} from "./operation-core";

export type GetListOperationOptions<
  T extends ZodSchema,
  Q extends ZodSchema,
  TTable extends BaseTable,
> = CoreGetListOperationOptions<T, Q, TTable, GetListRelations>;

const createOperation = createGetListOperationFactory<
  BaseTable,
  GetListRelations
>({
  createAction: createGetListAction as any,
  getTableName,
});

export const createGetListOperation = ({
  db,
  getSession,
}: {
  db?: NodePgDatabase<Record<string, unknown>>;
  getSession(req: NextRequest): Promise<{ userId?: string } | undefined>;
}) => createOperation({ db, getSession });
