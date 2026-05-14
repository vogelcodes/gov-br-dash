import { describe, it, expect } from "vitest";
import { createDatabase } from "../../src/db/connection.js";
import { initializeSchema } from "../../src/db/schema.js";
import { SqlitePortalDataRepository } from "../../src/db/portal-data-repository.js";
import { SqliteSyncRepository } from "../../src/db/sync-repository.js";
import { PortalDataSyncService } from "../../src/services/portal-data-sync.js";
import type {
  PortalSancoes,
  PortalTransparenciaClient,
} from "../../src/clients/portal-transparencia.js";

// Regression test for the bug where background portal sync starved the
// Fastify event loop: a tight sync for-loop over thousands of empenhos
// (each doing a synchronous better-sqlite3 upsert) blocked all HTTP
// responses — F5 in the browser only completed after the loop exited.
//
// Strategy: don't spin up Fastify; measure event-loop lag directly with a
// 20ms setInterval probe. A healthy loop wakes the timer within a few ms
// of the scheduled time; a starved loop wakes it tens of seconds late.
//
// Threshold: max observed lag < 250ms. Pre-fix this exceeded 1s easily
// with 5k empenhos. The fix uses bulkUpsertEmpenhos + setImmediate yield
// between 500-row batches.

function makeEmpenhos(n: number): unknown[] {
  const out: unknown[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      documento: `2024NE${String(i).padStart(6, "0")}`,
      ano: 2024,
      fase: 1,
      // padding to make JSON.stringify non-trivial — mirrors real portal payloads
      descricao: "Lorem ipsum dolor sit amet ".repeat(20),
      valor: i * 1.23,
      data: "2024-01-15",
    });
  }
  return out;
}

function makeStubClient(empenhos: unknown[]): PortalTransparenciaClient {
  return {
    async getPessoaJuridica() {
      return {};
    },
    async getPessoaFisica() {
      return {};
    },
    async getContratosByCnpj() {
      return [];
    },
    async getEmpenhosByCnpj() {
      return [];
    },
    async getEmpenhosAcrossYears() {
      return empenhos;
    },
    async getEmpenhoDetails() {
      return {};
    },
    async getItensEmpenho() {
      return [];
    },
    async getItemHistorico() {
      return [];
    },
    async getDocumentosRelacionados() {
      return [];
    },
    async getSancoesCnpj(): Promise<PortalSancoes> {
      return { ceis: [], cnep: [] };
    },
  };
}

describe("portal sync — event loop responsiveness", () => {
  it("does not block the event loop while ingesting 50k empenhos", async () => {
    const db = createDatabase(":memory:");
    initializeSchema(db);

    const portalRepo = new SqlitePortalDataRepository(db);
    const syncRepo = new SqliteSyncRepository(db);
    const client = makeStubClient(makeEmpenhos(50_000));
    const service = new PortalDataSyncService(portalRepo, client, syncRepo);

    const lags: number[] = [];
    const PROBE_INTERVAL_MS = 20;
    let last = Date.now();
    const probe = setInterval(() => {
      const now = Date.now();
      lags.push(Math.max(0, now - last - PROBE_INTERVAL_MS));
      last = now;
    }, PROBE_INTERVAL_MS);

    try {
      await service.syncSupplier("12345678000199", {
        includeDetails: false,
        includeContratos: false,
        includeSancoes: false,
        years: [2024],
      });
    } finally {
      clearInterval(probe);
      db.close();
    }

    // Must have actually observed lag samples — otherwise the test is vacuous.
    expect(lags.length).toBeGreaterThan(3);
    const maxLag = Math.max(...lags);
    const sorted = [...lags].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    // Pre-fix: maxLag was multi-second. Post-fix: under ~150ms on slow CI.
    expect(maxLag).toBeLessThan(250);
    expect(p95).toBeLessThan(100);
  }, 30_000);
});
