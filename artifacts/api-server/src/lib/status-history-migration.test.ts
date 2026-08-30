import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runtimeMigration = readFileSync(new URL("./migrate.ts", import.meta.url), "utf8");
const bootstrapMigration = readFileSync(
  new URL("../../migration.sql", import.meta.url),
  "utf8",
);

const migrationSources = [
  ["runtime startup migration", runtimeMigration],
  ["manual bootstrap migration", bootstrapMigration],
] as const;

describe("status history migration", () => {
  it.each(migrationSources)(
    "%s creates the history table and trigger",
    (_name, sql) => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS status_history/);
      expect(sql).toMatch(
        /CREATE TRIGGER orders_status_history[\s\S]*AFTER INSERT OR UPDATE OF status ON orders/,
      );
    },
  );

  it.each(migrationSources)(
    "%s records the initial baru status and changed statuses",
    (_name, sql) => {
      expect(sql).toMatch(
        /IF TG_OP = 'INSERT'[\s\S]*INSERT INTO status_history \(order_id, status\) VALUES \(NEW\.id, NEW\.status\)/,
      );
      expect(sql).toMatch(
        /ELSIF TG_OP = 'UPDATE' AND OLD\.status IS DISTINCT FROM NEW\.status[\s\S]*INSERT INTO status_history \(order_id, status\) VALUES \(NEW\.id, NEW\.status\)/,
      );
    },
  );
});