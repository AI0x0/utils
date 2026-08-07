import { PgTable } from "drizzle-orm/pg-core";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { ZodSchema } from "zod";
import { createPostAction } from "../actions/create-post-action";
import getTableName from "./get-table-name";
import {
  createPostOperationFactory,
  type PostOperationOptions as CorePostOperationOptions,
} from "./operation-core";
import type { DefaultSession, SessionGetter } from "./operation-common";

export type PostOperationOptions<
  IB extends ZodSchema,
  OB extends ZodSchema,
  TTable extends PgTable,
  TSession = DefaultSession,
> = CorePostOperationOptions<IB, OB, TTable, TSession>;

const createOperation = createPostOperationFactory<PgTable>({
  createAction: createPostAction as any,
  getTableName,
});

export const createPostOperation = <TSession = DefaultSession>({
  getSession,
  db,
}: {
  db?: NodePgDatabase<Record<string, unknown>>;
  getSession: SessionGetter<TSession>;
}) => createOperation<TSession>({ db, getSession });
