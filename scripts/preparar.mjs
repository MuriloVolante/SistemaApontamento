/**
 * Garante que existe um build de produção atualizado antes de subir o sistema.
 *
 * O modo de desenvolvimento compila cada tela na primeira visita e serve
 * código não minificado — a navegação fica lenta. Em produção tudo já vem
 * pronto. Aqui o build só roda quando algum arquivo mudou desde o último,
 * então a partida do dia a dia é imediata.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const MARCADOR = path.join(raiz, ".next", "BUILD_ID");
const VIGIADOS = [
  "src",
  "package.json",
  "package-lock.json",
  "next.config.mjs",
  "tsconfig.json",
];

/** Data de modificação mais recente dentro de um arquivo ou pasta. */
function maisRecente(alvo) {
  let info;
  try {
    info = fs.statSync(alvo);
  } catch {
    return 0;
  }
  if (!info.isDirectory()) return info.mtimeMs;

  let maior = info.mtimeMs;
  for (const item of fs.readdirSync(alvo)) {
    maior = Math.max(maior, maisRecente(path.join(alvo, item)));
  }
  return maior;
}

function precisaCompilar() {
  if (!fs.existsSync(MARCADOR)) return "nenhum build encontrado";

  const build = fs.statSync(MARCADOR).mtimeMs;
  for (const alvo of VIGIADOS) {
    if (maisRecente(path.join(raiz, alvo)) > build) return `${alvo} mudou desde o ultimo build`;
  }
  return null;
}

const motivo = precisaCompilar();

if (!motivo) {
  console.log("Build atualizado. Subindo...");
  process.exit(0);
}

console.log(`Compilando (${motivo}). Isso leva cerca de 30 segundos, so desta vez.`);

const next = path.join(raiz, "node_modules", "next", "dist", "bin", "next");
const resultado = spawnSync(process.execPath, [next, "build"], {
  cwd: raiz,
  stdio: "inherit",
});

process.exit(resultado.status ?? 1);
