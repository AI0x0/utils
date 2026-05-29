import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { NextRequest } from "next/server";
import { ZodSchema } from "zod";
import { createDeleteAction } from "../actions/create-delete-action";
import { BaseTable } from "../types";
import getTableName from "./get-table-name";
import {
  createDeleteOperationFactory,
  type DeleteOperationOptions as CoreDeleteOperationOptions,
} from "./operation-core";

export type DeleteOperationOptions<
  TTable extends BaseTable,
  B extends ZodSchema,
> = CoreDeleteOperationOptions<TTable, B>;

const createOperation = createDeleteOperationFactory<BaseTable>({
  createAction: createDeleteAction as any,
  getTableName,
});

export const createDeleteOperation = ({
  db,
  getSession,
}: {
  db?: NodePgDatabase<Record<string, unknown>>;
  getSession(req: NextRequest): Promise<{ userId?: string } | undefined>;
}) => createOperation({ db, getSession });
