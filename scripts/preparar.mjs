/**
 * Garante que existe um build de produção íntegro e atualizado antes de subir.
 *
 * O modo de desenvolvimento compila cada tela na primeira visita e serve
 * código não minificado — a navegação fica lenta. Em produção tudo já vem
 * pronto. Aqui o build só roda quando o código mudou, então a partida do dia a
 * dia é imediata.
 *
 * A decisão NÃO se apoia em nada que o Next escreva: o `.next/BUILD_ID` também
 * é criado pelo modo de desenvolvimento, e confiar nele já fez o sistema subir
 * com um build pela metade. Em vez disso, este script grava seu próprio
 * marcador com a impressão digital do código compilado e só confia nele.
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAIDA = path.join(raiz, ".next");
const MARCADOR = path.join(SAIDA, ".preparado.json");

/** Arquivos que, ao mudar, exigem recompilar. */
const VIGIADOS = ["src", "package.json", "package-lock.json", "next.config.mjs", "tsconfig.json"];

/** Sinais de que o build terminou e não foi interrompido no meio. */
const ESSENCIAIS = ["BUILD_ID", "build-manifest.json", path.join("server", "app")];

function percorrer(alvo, aoEncontrar) {
  let info;
  try {
    info = fs.statSync(alvo);
  } catch {
    return;
  }
  if (!info.isDirectory()) return aoEncontrar(alvo);

  for (const item of fs.readdirSync(alvo).sort()) {
    percorrer(path.join(alvo, item), aoEncontrar);
  }
}

/** Impressão digital pelo conteúdo — um `git pull` que reescreve arquivos
 *  idênticos não obriga a recompilar. */
function impressaoDigital() {
  const resumo = crypto.createHash("sha1");
  for (const vigiado of VIGIADOS) {
    percorrer(path.join(raiz, vigiado), (arquivo) => {
      resumo.update(path.relative(raiz, arquivo).replace(/\\/g, "/"));
      resumo.update(fs.readFileSync(arquivo));
    });
  }
  return resumo.digest("hex");
}

function buildIntegro() {
  return ESSENCIAIS.every((parte) => fs.existsSync(path.join(SAIDA, parte)));
}

function motivoParaCompilar(impressao) {
  if (!buildIntegro()) return "build ausente ou incompleto";

  let marcador;
  try {
    marcador = JSON.parse(fs.readFileSync(MARCADOR, "utf8"));
  } catch {
    return "build nao foi gerado por este script";
  }

  if (marcador.impressao !== impressao) return "o codigo mudou desde o ultimo build";
  return null;
}

const impressao = impressaoDigital();
const motivo = motivoParaCompilar(impressao);

if (!motivo) {
  console.log("Build atualizado. Subindo...");
  process.exit(0);
}

console.log(`Compilando (${motivo}). Isso leva cerca de 30 segundos, so desta vez.`);

// Começa do zero: restos de um build anterior ou do modo de desenvolvimento
// misturados na pasta são exatamente o que causa "Cannot find module".
fs.rmSync(SAIDA, { recursive: true, force: true });

const next = path.join(raiz, "node_modules", "next", "dist", "bin", "next");
const resultado = spawnSync(process.execPath, [next, "build"], { cwd: raiz, stdio: "inherit" });

if (resultado.status !== 0 || !buildIntegro()) {
  console.error("\nA compilacao falhou. O sistema nao vai subir com um build incompleto.");
  process.exit(1);
}

fs.writeFileSync(
  MARCADOR,
  JSON.stringify({ impressao, compiladoEm: new Date().toISOString() }, null, 2)
);
console.log("Build concluido.");
