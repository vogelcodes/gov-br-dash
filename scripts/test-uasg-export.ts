import { loadEnv } from "../src/config/index.js";
import { createDatabase } from "../src/db/connection.js";
import { initializeSchema } from "../src/db/schema.js";
import { SqliteSyncRepository } from "../src/db/sync-repository.js";
import { SqlitePortalDataRepository } from "../src/db/portal-data-repository.js";
import { renderUasgExport } from "../src/exports/index.js";
import { writeFileSync } from "node:fs";

const env = loadEnv();
const db = createDatabase(env.SQLITE_DB_PATH);
initializeSchema(db);
const sync = new SqliteSyncRepository(db);
const portal = new SqlitePortalDataRepository(db);

const csv = await renderUasgExport({
  codigoUasg: "160292",
  format: "csv",
  syncRepo: sync,
  portalRepo: portal,
});
writeFileSync("scratch-uasg-export.csv", csv.buffer);
console.log("csv:", csv.filename, csv.buffer.length, "bytes");

const xlsx = await renderUasgExport({
  codigoUasg: "160292",
  format: "xlsx",
  syncRepo: sync,
  portalRepo: portal,
});
writeFileSync("scratch-uasg-export.xlsx", xlsx.buffer);
console.log("xlsx:", xlsx.filename, xlsx.buffer.length, "bytes");

db.close();
