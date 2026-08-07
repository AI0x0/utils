import { PgTable } from "drizzle-orm/pg-core";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { ZodSchema } from "zod";
import { createPutAction } from "../actions/create-put-action";
import getTableName from "./get-table-name";
import {
  createPutOperationFactory,
  type PutOperationOptions as CorePutOperationOptions,
} from "./operation-core";
import type { DefaultSession, SessionGetter } from "./operation-common";

export type PutOperationOptions<
  IB extends ZodSchema,
  OB extends ZodSchema,
  TTable extends PgTable,
  TSession = DefaultSession,
> = CorePutOperationOptions<IB, OB, TTable, TSession>;

const createOperation = createPutOperationFactory<PgTable>({
  createAction: createPutAction as any,
  getTableName,
});

export const createPutOperation = <TSession = DefaultSession>({
  getSession,
  db,
}: {
  getSession: SessionGetter<TSession>;
  db?: NodePgDatabase<Record<string, unknown>>;
}) => createOperation<TSession>({ db, getSession });
