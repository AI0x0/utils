import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { ZodSchema } from "zod";
import { createGetAction } from "../actions/create-get-action";
import { BaseTable, GetListRelations } from "../types";
import getTableName from "./get-table-name";
import {
  createGetOperationFactory,
  type GetOperationOptions as CoreGetOperationOptions,
} from "./operation-core";
import type { DefaultSession, SessionGetter } from "./operation-common";

export type GetOperationOptions<
  T extends ZodSchema,
  Q extends ZodSchema,
  TTable extends BaseTable,
  TSession = DefaultSession,
> = CoreGetOperationOptions<T, Q, TTable, GetListRelations, TSession>;

const createOperation = createGetOperationFactory<BaseTable, GetListRelations>({
  createAction: createGetAction as any,
  getTableName,
});

export const createGetOperation = <TSession = DefaultSession>({
  getSession,
  db,
}: {
  db?: NodePgDatabase<Record<string, unknown>>;
  getSession: SessionGetter<TSession>;
}) => createOperation<TSession>({ db, getSession });
