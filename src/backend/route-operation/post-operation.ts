import { PgTable } from "drizzle-orm/pg-core";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { NextRequest } from "next/server";
import { ZodSchema } from "zod";
import { createPostAction } from "../actions/create-post-action";
import getTableName from "./get-table-name";
import {
  createPostOperationFactory,
  type PostOperationOptions as CorePostOperationOptions,
} from "./operation-core";

export type PostOperationOptions<
  IB extends ZodSchema,
  OB extends ZodSchema,
  TTable extends PgTable,
> = CorePostOperationOptions<IB, OB, TTable>;

const createOperation = createPostOperationFactory<PgTable>({
  createAction: createPostAction as any,
  getTableName,
});

export const createPostOperation = ({
  getSession,
  db,
}: {
  db?: NodePgDatabase<Record<string, unknown>>;
  getSession(req: NextRequest): Promise<{ userId?: string } | undefined>;
}) => createOperation({ db, getSession });
