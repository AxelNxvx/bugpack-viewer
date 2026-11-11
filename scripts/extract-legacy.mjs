import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const lines = readFileSync(join(root, "index.legacy.html"), "utf8").split(/\r?\n/);

mkdirSync(join(root, "src/styles"), { recursive: true });
mkdirSync(join(root, "src/legacy"), { recursive: true });

const cssLines = lines.slice(10, 636).filter((l) => !/^<\/style>/i.test(l.trim()));
writeFileSync(join(root, "src/styles/viewer.css"), cssLines.join("\n"), "utf8");
writeFileSync(join(root, "src/legacy/viewer-shell.html"), lines.slice(639, 802).join("\n"), "utf8");

const js = lines.slice(805, 3248).join("\n");
const wrapped = `import { unzipSync, zipSync, gunzipSync } from "fflate";

const fflate = { unzipSync, zipSync, gunzipSync };

export function initLegacyViewer(): void {
${js}
  window.switchTab = switchTab;
}
`;
writeFileSync(join(root, "src/legacy/viewer-app.ts"), wrapped, "utf8");
console.log("extracted viewer-app.ts", wrapped.length, "bytes");
