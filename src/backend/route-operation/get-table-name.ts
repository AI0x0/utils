import { PgTable } from "drizzle-orm/pg-core";

function getTableName(table: PgTable): string {
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
