import { loadEnv } from "../src/config/index.js";
import { HttpPortalTransparenciaClient } from "../src/clients/portal-transparencia.js";
import { createDatabase } from "../src/db/connection.js";
import { initializeSchema } from "../src/db/schema.js";
import { SqliteSyncRepository } from "../src/db/sync-repository.js";
import { SqlitePortalDataRepository } from "../src/db/portal-data-repository.js";
import { PortalDataSyncService } from "../src/services/portal-data-sync.js";

const env = loadEnv();
const client = new HttpPortalTransparenciaClient({
  baseUrl: env.GOVBR_API_BASE_URL,
  apiKey: env.GOVBR_API_KEY,
  timeoutMs: env.GOVBR_API_TIMEOUT_MS,
  maxRetries: env.GOVBR_API_MAX_RETRIES,
  rateLimitDayPerMin: env.PORTAL_RATE_LIMIT_DAY_PER_MIN,
  rateLimitNightPerMin: env.PORTAL_RATE_LIMIT_NIGHT_PER_MIN,
});
const db = createDatabase(env.SQLITE_DB_PATH);
initializeSchema(db);
const sync = new SqliteSyncRepository(db);
const portal = new SqlitePortalDataRepository(db);
const service = new PortalDataSyncService(portal, client, sync);

const cnpj = process.argv[2] ?? "17774419000101";
console.log(`syncSupplier(${cnpj})…`);
const result = await service.syncSupplier(cnpj, {
  includeDetails: true,
  includeContratos: true,
  includeSancoes: true,
});
console.log("result:", result);

const empenhos = portal.listEmpenhosByCnpj(cnpj);
const contratos = portal.listContratosByCnpj(cnpj);
const sancoes = portal.listSancoesByCnpj(cnpj);
console.log(
  `DB rows — empenhos: ${empenhos.length} · contratos: ${contratos.length} · sancoes: ${sancoes.length}`,
);
if (empenhos.length > 0) {
  const sample = empenhos[0]!;
  const bundle = portal.findEmpenhoBundle(sample.documento);
  console.log(
    `bundle for ${sample.documento}: itens=${bundle?.itens.length ?? 0}, historico=${bundle?.historico.length ?? 0}, relacionados=${bundle?.relacionados.length ?? 0}`,
  );
}
db.close();
console.log("DONE");
