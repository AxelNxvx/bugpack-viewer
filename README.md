<<<<<<< HEAD
# BugPack Viewer

Visor local de archivos `.bugpack` (video + logs). Stack preparado para integrar un backend más adelante.

## Stack recomendado

| Capa | Elección | Motivo |
|------|----------|--------|
| UI | **React 19** + **Vite 6** | SPA rápida, reproducción de video y canvas sin SSR innecesario |
| Datos remotos | **TanStack Query** | Caché, reintentos y estados `loading/error` listos para REST |
| HTTP | `src/api/client.ts` | Un solo punto para auth, headers y `VITE_API_URL` |
| Compresión | **fflate** | Mismo formato zip que la extensión |

**¿Por qué no Next.js aquí?** El visor es casi todo cliente (archivos locales, `<video>`, anotaciones). Cuando tengas backend, puede ser un API aparte (FastAPI, Nest, etc.) o una app Next solo para login/listado; este repo sigue siendo el visor desplegable en CDN.

## Instalar pnpm (Windows)

El error `ERR_PNPM_DLX_MULTIPLE_BINS` aparece porque `@pnpm/exe` publica varios ejecutables (`pnpm`, `pn`, `pnpx`…) y `dlx` no sabe cuál usar. **No hace falta** ese comando para este proyecto.

Elige **una** opción:

**A – Script oficial (recomendado en PowerShell)**

```powershell
Invoke-WebRequest https://get.pnpm.io/install.ps1 -UseBasicParsing | Invoke-Expression
```

Cierra y vuelve a abrir la terminal. Comprueba: `pnpm -v`.

**B – npm global**

```powershell
npm install -g pnpm
```

**C – Corepack** (incluido en Node 18+; alinea la versión del repo)

```powershell
corepack enable
corepack prepare pnpm@10.12.1 --activate
```

Si `corepack enable` falla con `EPERM` en `C:\Program Files\nodejs`, abre PowerShell **como administrador** o usa A o B.

## Desarrollo

```bash
pnpm install
pnpm dev
```

Abre http://localhost:5173 y arrastra un `.bugpack`.

## Build

```bash
pnpm build
pnpm preview
```

Salida en `dist/` (estático, sirve en cualquier hosting).

## Backend (futuro)

1. Copia `.env.example` → `.env` y define `VITE_API_URL=https://api.tudominio.com`
2. Implementa en el servidor rutas como `GET /api/reports` y `GET /api/reports/:id/bugpack`
3. Usa `src/api/reports.ts` desde componentes React (con `useQuery`)

## Estructura

```
src/
  api/           # Cliente HTTP y endpoints
  providers/     # React Query
  legacy/        # Lógica del visor (migrada desde index.legacy.html)
  styles/        # Tema visual
public/          # Favicons e identity
index.legacy.html  # Referencia original (no usada en build)
```

## Regenerar legacy desde HTML

Si editas `index.legacy.html`:

```bash
pnpm extract-legacy
```
=======
# bugpack-viewer
>>>>>>> c6906b24aa981a8e745ec28aba3ac87141d9535e
