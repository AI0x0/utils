import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { ZodSchema } from "zod";
import { createDeleteAction } from "../actions/create-delete-action";
import { BaseTable } from "../types";
import getTableName from "./get-table-name";
import {
  createDeleteOperationFactory,
  type DeleteOperationOptions as CoreDeleteOperationOptions,
} from "./operation-core";
import type { DefaultSession, SessionGetter } from "./operation-common";

export type DeleteOperationOptions<
  TTable extends BaseTable,
  B extends ZodSchema,
  TSession = DefaultSession,
> = CoreDeleteOperationOptions<TTable, B, TSession>;

const createOperation = createDeleteOperationFactory<BaseTable>({
  createAction: createDeleteAction as any,
  getTableName,
});

export const createDeleteOperation = <TSession = DefaultSession>({
  db,
  getSession,
}: {
  db?: NodePgDatabase<Record<string, unknown>>;
  getSession: SessionGetter<TSession>;
}) => createOperation<TSession>({ db, getSession });
