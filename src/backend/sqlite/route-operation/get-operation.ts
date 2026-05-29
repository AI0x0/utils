import { NextRequest } from "next/server";
import { ZodSchema } from "zod";
import { createGetAction } from "../actions/create-get-action";
import { BaseTable, GetListRelations } from "../types";
import {
  createGetOperationFactory,
  type GetOperationOptions as CoreGetOperationOptions,
} from "@/backend/route-operation/operation-core";
import getTableName from "./get-table-name";

export type GetOperationOptions<
  T extends ZodSchema,
  Q extends ZodSchema,
  TTable extends BaseTable,
> = CoreGetOperationOptions<T, Q, TTable, GetListRelations>;

const createOperation = createGetOperationFactory<BaseTable, GetListRelations>({
  createAction: createGetAction as any,
  getTableName,
});

export const createGetOperation = ({
  getSession,
  db,
}: {
  db?: unknown;
  getSession(req: NextRequest): Promise<{ userId?: string } | undefined>;
}) => createOperation({ db, getSession });
