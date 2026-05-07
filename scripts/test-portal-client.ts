// Live smoke test for the Portal da Transparência client and per-ARP sync.
// Run: npx tsx scripts/test-portal-client.ts
import { loadEnv } from "../src/config/index.js";
import { HttpPortalTransparenciaClient } from "../src/clients/portal-transparencia.js";
import { createDatabase } from "../src/db/connection.js";
import { initializeSchema } from "../src/db/schema.js";
import { SqliteSyncRepository } from "../src/db/sync-repository.js";
import { SqlitePortalDataRepository } from "../src/db/portal-data-repository.js";
import { PortalDataSyncService } from "../src/services/portal-data-sync.js";
import { renderArpExport } from "../src/exports/index.js";
import { writeFileSync } from "node:fs";

const env = loadEnv();

function header(label: string): void {
  console.log(`\n=== ${label} ===`);
}

function preview(label: string, value: unknown, max = 400): void {
  const json = JSON.stringify(value);
  console.log(label, json.length > max ? `${json.slice(0, max)}…` : json);
}

async function main() {
  const client = new HttpPortalTransparenciaClient({
    baseUrl: env.GOVBR_API_BASE_URL,
    apiKey: env.GOVBR_API_KEY,
    timeoutMs: env.GOVBR_API_TIMEOUT_MS,
    maxRetries: env.GOVBR_API_MAX_RETRIES,
    rateLimitDayPerMin: env.PORTAL_RATE_LIMIT_DAY_PER_MIN,
    rateLimitNightPerMin: env.PORTAL_RATE_LIMIT_NIGHT_PER_MIN,
  });

  // Pick a known supplier from our DB (top by item count)
  const cnpj = "17774419000101";
  const arpAta = "00394452000103-1-022743/2024-000001"; // 14 suppliers

  header(`getPessoaJuridica(${cnpj})`);
  try {
    const pj = await client.getPessoaJuridica(cnpj);
    preview("pj:", pj);
  } catch (err) {
    console.error("FAIL:", err instanceof Error ? err.message : err);
  }

  header(`getContratosByCnpj(${cnpj})`);
  try {
    const contratos = await client.getContratosByCnpj(cnpj);
    console.log(`contratos.length = ${contratos.length}`);
    if (contratos.length > 0) preview("first:", contratos[0]);
  } catch (err) {
    console.error("FAIL:", err instanceof Error ? err.message : err);
  }

  header(`getEmpenhosByCnpj(${cnpj}, 2025)`);
  let firstDocumento: string | null = null;
  try {
    const emps = await client.getEmpenhosByCnpj(cnpj, 2025);
    console.log(`empenhos.length = ${emps.length}`);
    if (emps.length > 0) {
      preview("first:", emps[0]);
      const doc = (emps[0] as { documento?: string }).documento;
      if (doc) firstDocumento = doc;
    }
  } catch (err) {
    console.error("FAIL:", err instanceof Error ? err.message : err);
  }

  if (firstDocumento) {
    header(`getEmpenhoDetails(${firstDocumento})`);
    try {
      const detail = await client.getEmpenhoDetails(firstDocumento);
      preview("detail:", detail);
    } catch (err) {
      console.error("FAIL:", err instanceof Error ? err.message : err);
    }
    header(`getItensEmpenho(${firstDocumento})`);
    try {
      const itens = await client.getItensEmpenho(firstDocumento);
      console.log(`itens.length = ${itens.length}`);
      if (itens.length > 0) preview("first:", itens[0]);
    } catch (err) {
      console.error("FAIL:", err instanceof Error ? err.message : err);
    }
    header(`getDocumentosRelacionados(${firstDocumento})`);
    try {
      const rel = await client.getDocumentosRelacionados(firstDocumento);
      console.log(`relacionados.length = ${rel.length}`);
    } catch (err) {
      console.error("FAIL:", err instanceof Error ? err.message : err);
    }
  }

  header(`getSancoesCnpj(${cnpj})`);
  try {
    const sanc = await client.getSancoesCnpj(cnpj);
    console.log(`ceis=${sanc.ceis.length} cnep=${sanc.cnep.length}`);
  } catch (err) {
    console.error("FAIL:", err instanceof Error ? err.message : err);
  }

  // ------- service-level sync against a real ARP -------
  header(`PortalDataSyncService.syncArpSuppliers(${arpAta})`);
  const db = createDatabase(env.SQLITE_DB_PATH);
  initializeSchema(db);
  const syncRepo = new SqliteSyncRepository(db);
  const portalRepo = new SqlitePortalDataRepository(db);
  const service = new PortalDataSyncService(portalRepo, client, syncRepo);

  const result = await service.syncArpSuppliers(arpAta, {
    includeDetails: false, // skip detail fan-out — saves dozens of calls
    includeContratos: true,
    includeSancoes: true,
  });
  console.log("syncArpSuppliers result:", result);

  // Verify rows landed
  const empenhosForArp = portalRepo.listEmpenhosByArp(arpAta);
  const contratosForArp = portalRepo.listContratosByArp(arpAta);
  console.log(
    `portal_empenhos rows for ARP = ${empenhosForArp.length}`,
    `portal_contratos rows for ARP = ${contratosForArp.length}`,
  );

  // ------- exports -------
  header("renderArpExport (CSV + XLSX)");
  const csv = await renderArpExport({
    numeroControlePncpAta: arpAta,
    format: "csv",
    syncRepo,
    portalRepo,
  });
  writeFileSync("scratch-export.csv", csv.buffer);
  console.log(`wrote scratch-export.csv (${csv.buffer.length} bytes)`);

  const xlsx = await renderArpExport({
    numeroControlePncpAta: arpAta,
    format: "xlsx",
    syncRepo,
    portalRepo,
  });
  writeFileSync("scratch-export.xlsx", xlsx.buffer);
  console.log(`wrote scratch-export.xlsx (${xlsx.buffer.length} bytes)`);

  db.close();
  console.log("\nDONE");
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
