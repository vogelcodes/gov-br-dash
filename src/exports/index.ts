import type { SqlitePortalDataRepository } from "../db/portal-data-repository.js";
import type { SqliteSyncRepository } from "../db/sync-repository.js";
import { renderComparisonCsv, renderUasgCsv } from "./csv.js";
import { renderComparisonXlsx, renderUasgXlsx } from "./xlsx.js";
import {
  flattenArpComparison,
  flattenUasgComparison,
} from "./serializer.js";

export type ArpExportFormat = "csv" | "xlsx";

export interface ArpExportRequest {
  numeroControlePncpAta: string;
  format: ArpExportFormat;
  syncRepo: SqliteSyncRepository;
  portalRepo: SqlitePortalDataRepository;
}

export interface UasgExportRequest {
  codigoUasg: string;
  format: ArpExportFormat;
  syncRepo: SqliteSyncRepository;
  portalRepo: SqlitePortalDataRepository;
}

export interface ExportResult {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

export async function renderArpExport(
  req: ArpExportRequest,
): Promise<ExportResult> {
  const bundle = flattenArpComparison({
    numeroControlePncpAta: req.numeroControlePncpAta,
    syncRepo: req.syncRepo,
    portalRepo: req.portalRepo,
  });
  if (!bundle) {
    throw new Error(`ARP not found: ${req.numeroControlePncpAta}`);
  }
  const safeId = req.numeroControlePncpAta.replace(/[^a-zA-Z0-9]+/g, "_");
  const baseName = `arp_${safeId}`;
  if (req.format === "csv") {
    return {
      buffer: renderComparisonCsv(bundle),
      filename: `${baseName}.csv`,
      contentType: "text/csv; charset=utf-8",
    };
  }
  if (req.format === "xlsx") {
    return {
      buffer: await renderComparisonXlsx(bundle),
      filename: `${baseName}.xlsx`,
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }
  throw new Error(`Unsupported export format: ${String(req.format)}`);
}

export async function renderUasgExport(
  req: UasgExportRequest,
): Promise<ExportResult> {
  const bundle = flattenUasgComparison({
    codigoUasg: req.codigoUasg,
    syncRepo: req.syncRepo,
    portalRepo: req.portalRepo,
  });
  if (!bundle) {
    throw new Error(`UASG not found: ${req.codigoUasg}`);
  }
  const baseName = `uasg_${req.codigoUasg.replace(/[^a-zA-Z0-9]+/g, "_")}`;
  if (req.format === "csv") {
    return {
      buffer: renderUasgCsv(bundle),
      filename: `${baseName}.csv`,
      contentType: "text/csv; charset=utf-8",
    };
  }
  if (req.format === "xlsx") {
    return {
      buffer: await renderUasgXlsx(bundle),
      filename: `${baseName}.xlsx`,
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }
  throw new Error(`Unsupported export format: ${String(req.format)}`);
}
