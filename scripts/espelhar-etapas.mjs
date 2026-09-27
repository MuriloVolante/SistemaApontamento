/**
 * Regrava o bloco de etapas do `supabase/schema.sql` a partir da fonte única,
 * `src/lib/etapas-iniciais.ts`. Rode depois de mudar a lista:
 *
 *   node scripts/espelhar-etapas.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ts = fs.readFileSync(`${raiz}/src/lib/etapas-iniciais.ts`, "utf8");
const nomes = [...ts.matchAll(/^\s+"([^"]+)",$/gm)].map((m) => m[1]);
const chave = (n) => n.trim().normalize("NFC").toLocaleLowerCase("pt-BR");
const q = (t) => `'${t.replace(/'/g, "''")}'`;

const bloco =
  "-- Espelho de src/lib/etapas-iniciais.ts, que e a fonte unica. Ao mudar a\n" +
  "-- lista la, gere este bloco de novo em vez de editar a mao.\n" +
  "insert into etapas (nome, nome_chave) values\n" +
  nomes.map((n) => `  (${q(n)}, ${q(chave(n))})`).join(",\n") +
  "\non conflict (nome) do nothing;";

const p = `${raiz}/supabase/schema.sql`;
let s = fs.readFileSync(p, "utf8");
const ini = s.indexOf("insert into etapas (nome");
const fim = s.indexOf("on conflict (nome) do nothing;") + "on conflict (nome) do nothing;".length;
// tira um eventual comentario de espelho anterior logo acima do insert
let antes = s.slice(0, ini).replace(/-- Espelho de src\/lib\/etapas-iniciais\.ts[^\n]*\n-- [^\n]*\n$/, "");
s = antes + bloco + s.slice(fim);
fs.writeFileSync(p, s);
console.log("espelho gerado:", nomes.length, "etapas");
