import { normalizePaging } from "@/backend/actions/paging";
import { getListQuery } from "./get-list-query";

async function runSelect<T>(query: unknown): Promise<T[]> {
  const executable = query as {
    all?: () => T[] | Promise<T[]>;
    execute?: () => T[] | Promise<T[]>;
  };

  if (executable.all) {
    return executable.all();
  }

  if (executable.execute) {
    return executable.execute();
  }

  return [];
}

export function getListData({
  query,
  countQuery,
  pageSize: rawPageSize,
  current: rawCurrent,
}: {
  bodySchema?: any;
  current?: number;
  pageSize?: number;
} & ReturnType<typeof getListQuery>) {
  // 归一化的理由见 backend/actions/paging。
  const { current, pageSize } = normalizePaging({
    current: rawCurrent,
    pageSize: rawPageSize,
  });
  return async () => {
    const dataQuery = query.limit(pageSize).offset((current - 1) * pageSize);
    const data = await runSelect(dataQuery);
    const [{ count }] = await runSelect<{ count: number | string }>(countQuery);

    return { data, total: Number(count) };
  };
}
