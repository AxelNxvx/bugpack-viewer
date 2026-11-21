import { apiFetch, apiBlob, isApiConfigured } from "./client";

export type NasStatus = "pending" | "uploaded" | "error" | "disabled";

export type RemoteReportSummary = {
  id: string;
  title: string;
  createdAt: string;
  filename?: string;
  size?: number;
  url?: string;
  env?: string;
  severity?: string;
  score?: number;
  user?: string;
  nas?: { status: NasStatus; path?: string; error?: string | null };
};

/** Listado remoto de reportes. Devuelve [] si el API no está configurado. */
export async function listRemoteReports(): Promise<RemoteReportSummary[]> {
  if (!isApiConfigured()) return [];
  return apiFetch<RemoteReportSummary[]>("/api/reports");
}

/** Descarga un .bugpack desde el API. */
export function downloadRemoteReport(id: string): Promise<Blob> {
  return apiBlob(`/api/reports/${encodeURIComponent(id)}/bugpack`);
}

/** Reintenta la subida del reporte al NAS. */
export function retryNasUpload(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/reports/${encodeURIComponent(id)}/nas-retry`, { method: "POST" });
}

/**
 * Muestra un .bugpack en la interfaz del visor (video, consola, red, etc.).
 * El visor escucha el evento "bugpack-import" (ver viewer-app.ts → setupExtensionImport).
 */
export async function openReportInViewer(blob: Blob, filename: string) {
  window.dispatchEvent(new CustomEvent(`bugpack-import`, {
    detail: { bytes: new Uint8Array(await blob.arrayBuffer()), filename}
  }));
}
