export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Dirección del servidor. Se puede cambiar con VITE_API_URL en el archivo .env del visor.
export const baseUrl: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") ||
  "http://localhost:3001";

export function isApiConfigured(): boolean {
  return baseUrl.length > 0;
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  if (!isApiConfigured()) {
    throw new Error("VITE_API_URL is not set");
  }

  const headers = new Headers(init.headers);
  // Solo para cuerpos de texto (JSON). FormData/Blob deben fijar su propio Content-Type.
  if (typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${baseUrl}${path}`, { ...init, headers });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(
      `API Error: ${res.status} ${res.statusText || "Request failed"}`,
      res.status,
      body
    );
  }

  return res;
}

/** Cliente HTTP centralizado: devuelve JSON tipado. */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await request(path, init);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Descarga un recurso binario (imágenes, video, zips, etc.). */
export async function apiBlob(path: string, init: RequestInit = {}): Promise<Blob> {
  const res = await request(path, init);
  return res.blob();
}