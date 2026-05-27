import { SQLiteTable } from "drizzle-orm/sqlite-core";

function getTableName(table: SQLiteTable): string {
  const symbols = Object.getOwnPropertySymbols(table);
  const nameSymbol = symbols.find(
    (sym) => sym.toString() === "Symbol(drizzle:Name)",
  );

  if (nameSymbol) {
    return (table as unknown as Record<symbol, string>)[nameSymbol];
  }

  return "";
}

export default getTableName;
