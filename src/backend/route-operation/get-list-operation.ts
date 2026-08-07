import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { ZodSchema } from "zod";
import { createGetListAction } from "../actions/create-get-list-action";
import { BaseTable, GetListRelations } from "../types";
import getTableName from "./get-table-name";
import {
  createGetListOperationFactory,
  type GetListOperationOptions as CoreGetListOperationOptions,
} from "./operation-core";
import type { DefaultSession, SessionGetter } from "./operation-common";

export type GetListOperationOptions<
  T extends ZodSchema,
  Q extends ZodSchema,
  TTable extends BaseTable,
  TSession = DefaultSession,
> = CoreGetListOperationOptions<T, Q, TTable, GetListRelations, TSession>;

const createOperation = createGetListOperationFactory<
  BaseTable,
  GetListRelations
>({
  createAction: createGetListAction as any,
  getTableName,
});

export const createGetListOperation = <TSession = DefaultSession>({
  db,
  getSession,
}: {
  db?: NodePgDatabase<Record<string, unknown>>;
  getSession: SessionGetter<TSession>;
}) => createOperation<TSession>({ db, getSession });
