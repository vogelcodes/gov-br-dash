import { loadEnv } from "../src/config/index.js";
import { createDatabase } from "../src/db/connection.js";

const KEEP = new Set(["users"]);

const env = loadEnv();
const db = createDatabase(env.SQLITE_DB_PATH);

const tables = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  )
  .all() as { name: string }[];

const targets = tables.map((t) => t.name).filter((n) => !KEEP.has(n));

db.exec("PRAGMA foreign_keys = OFF");
const tx = db.transaction(() => {
  for (const name of targets) {
    db.exec(`DELETE FROM "${name}"`);
  }
  const hasSeq = db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'",
    )
    .get();
  if (hasSeq) {
    db.exec("DELETE FROM sqlite_sequence WHERE name NOT IN ('users')");
  }
});
tx();
db.exec("PRAGMA foreign_keys = ON");
db.exec("VACUUM");

console.log(`Cleared ${targets.length} tables. Kept: ${[...KEEP].join(", ")}`);
console.log("Tables cleared:", targets.join(", "));
