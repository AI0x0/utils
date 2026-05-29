import { PgTable } from "drizzle-orm/pg-core";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { NextRequest } from "next/server";
import { ZodSchema } from "zod";
import { createPutAction } from "../actions/create-put-action";
import getTableName from "./get-table-name";
import {
  createPutOperationFactory,
  type PutOperationOptions as CorePutOperationOptions,
} from "./operation-core";

export type PutOperationOptions<
  IB extends ZodSchema,
  OB extends ZodSchema,
  TTable extends PgTable,
> = CorePutOperationOptions<IB, OB, TTable>;

const createOperation = createPutOperationFactory<PgTable>({
  createAction: createPutAction as any,
  getTableName,
});

export const createPutOperation = ({
  getSession,
  db,
}: {
  getSession(req: NextRequest): Promise<{ userId?: string } | undefined>;
  db?: NodePgDatabase<Record<string, unknown>>;
}) => createOperation({ db, getSession });
