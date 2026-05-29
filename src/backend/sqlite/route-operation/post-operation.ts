import { SQLiteTable } from "drizzle-orm/sqlite-core";
import { NextRequest } from "next/server";
import { ZodSchema } from "zod";
import { createPostAction } from "../actions/create-post-action";
import {
  createPostOperationFactory,
  type PostOperationOptions as CorePostOperationOptions,
} from "@/backend/route-operation/operation-core";
import getTableName from "./get-table-name";

export type PostOperationOptions<
  IB extends ZodSchema,
  OB extends ZodSchema,
  TTable extends SQLiteTable,
> = CorePostOperationOptions<IB, OB, TTable>;

const createOperation = createPostOperationFactory<SQLiteTable>({
  createAction: createPostAction as any,
  getTableName,
});

export const createPostOperation = ({
  getSession,
  db,
}: {
  db?: unknown;
  getSession(req: NextRequest): Promise<{ userId?: string } | undefined>;
}) => createOperation({ db, getSession });
