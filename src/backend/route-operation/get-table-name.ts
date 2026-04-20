import { SQLiteTable } from "drizzle-orm/sqlite-core";

function getTableName(table: SQLiteTable): string {
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
