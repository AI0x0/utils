import { SQLiteTable } from "drizzle-orm/sqlite-core";
import { NextRequest } from "next/server";
import { ZodSchema } from "zod";
import { createPutAction } from "../actions/create-put-action";
import {
  createPutOperationFactory,
  type PutOperationOptions as CorePutOperationOptions,
} from "@/backend/route-operation/operation-core";
import getTableName from "./get-table-name";

export type PutOperationOptions<
  IB extends ZodSchema,
  OB extends ZodSchema,
  TTable extends SQLiteTable,
> = CorePutOperationOptions<IB, OB, TTable>;

const createOperation = createPutOperationFactory<SQLiteTable>({
  createAction: createPutAction as any,
  getTableName,
});

export const createPutOperation = ({
  getSession,
  db,
}: {
  getSession(req: NextRequest): Promise<{ userId?: string } | undefined>;
  db?: unknown;
}) => createOperation({ db, getSession });
