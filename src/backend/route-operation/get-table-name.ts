import { PgTable } from "drizzle-orm/pg-core";

function getTableName(table: PgTable): string {
  const symbols = Object.getOwnPropertySymbols(table);
  const nameSymbol = symbols.find(
    (sym) => sym.toString() === "Symbol(drizzle:Name)",
  );

  if (nameSymbol) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return table[nameSymbol];
  }

  return "";
}

export default getTableName;
