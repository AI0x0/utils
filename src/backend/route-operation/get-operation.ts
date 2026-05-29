import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { NextRequest } from "next/server";
import { ZodSchema } from "zod";
import { createGetAction } from "../actions/create-get-action";
import { BaseTable, GetListRelations } from "../types";
import getTableName from "./get-table-name";
import {
  createGetOperationFactory,
  type GetOperationOptions as CoreGetOperationOptions,
} from "./operation-core";

export type GetOperationOptions<
  T extends ZodSchema,
  Q extends ZodSchema,
  TTable extends BaseTable,
> = CoreGetOperationOptions<T, Q, TTable, GetListRelations>;

const createOperation = createGetOperationFactory<BaseTable, GetListRelations>({
  createAction: createGetAction as any,
  getTableName,
});

export const createGetOperation = ({
  getSession,
  db,
}: {
  db?: NodePgDatabase<Record<string, unknown>>;
  getSession(req: NextRequest): Promise<{ userId?: string } | undefined>;
}) => createOperation({ db, getSession });
